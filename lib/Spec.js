module.exports = Spec;

var Path = require('path');
var utils = require('./utils');
var Promise = require('bluebird');
var Import = require('./Import');
var Clause = require('./Clause');
var ClauseNumbers = require('./clauseNums');
var Algorithm = require('./Algorithm');
var Note = require('./Note');
var Production = require('./Production');
var hljs = require('highlight.js');
var emd = require('ecmarkdown');
var gmd = require('grammarkdown');
var Grammar = gmd.Grammar;
var EmitFormat = gmd.EmitFormat;

var gmdCompile = function(text) {
  var out;
  function readFile(file) { return text }
  function writeFile(file, output) { out = output }
  var g = new Grammar(["file.grammar"], { format: EmitFormat.ecmarkup }, readFile);
  g.emit(undefined, writeFile);

  return out;
}

function Spec(rootPath, fetch, doc) {
  this.rootPath = rootPath;
  this.rootDir = Path.dirname(this.rootPath);
  this.doc = doc;
  this.fetch = fetch;
  this.subclauses = [];
  this._numberer = ClauseNumbers.iterator();
  this.externalBiblio = {
    ops: {}
  };
  this.biblio = {
    ops: {}
  };

}

Spec.prototype.build = function() {
  var s = Date.now();
  return this.inlineAllImports()
    .then(this.loadES6Biblio.bind(this))
    .then(this.loadBiblios.bind(this))
    .then(this.buildClauses.bind(this))
    .then(this.buildSyntax.bind(this))
    .then(this.buildToc.bind(this))
    .then(this.buildAlgs.bind(this))
    .then(this.buildProductions.bind(this))
    .then(this.highlightCode.bind(this))
    .then(function() {
      return '<!doctype html>\n' + this.doc.documentElement.innerHTML;
    }.bind(this));
};

Spec.prototype.buildAlgs = function() {
  var algs = this.doc.querySelectorAll('emu-alg');
  var builders = [];

  // initialize first to collect any aoids
  for(var i = 0; i < algs.length; i++) {
    builders.push(new Algorithm(this, algs[i]));
  }

  // build each
  builders.forEach(function(b) { b.build(); });
};

Spec.prototype.loadES6Biblio = function() {
  return this.fetch(Path.join(__dirname, '../es6biblio.json'))
    .then(function(es6bib) {
      es6bib = JSON.parse(es6bib);
      Object.keys(es6bib).forEach(function(site) {
        Object.keys(es6bib[site]).forEach(function(alg) {
          this.externalBiblio.ops[alg] = site + es6bib[site][alg];
        }, this);
      }, this);
    }.bind(this));
};

// biblio paths are always relative to root document
Spec.prototype.loadBiblios = function() {
  var spec = this;

  var bibs = Array.prototype.slice.call(this.doc.querySelectorAll('emu-biblio'));

  return Promise.all(
    bibs.map(function(bib) {
      var path = Path.join(spec.rootDir, bib.getAttribute('href'));

      return spec.fetch(path)
        .then(function(contents) {
          contents = JSON.parse(contents);
          Object.keys(contents).forEach(function(site) {
            var ops = contents[site]["abstract operations"];
            Object.keys(ops).forEach(function(alg) {
              spec.externalBiblio.ops[alg] = site + ops[alg];
            });
          });
        });
    })
  );
};

Spec.prototype.inlineAllImports = function() {
  var imports = this.doc.querySelectorAll('link[rel=import]');
  imports = Array.prototype.slice.call(imports);

  return this.inlineImports(imports);
};

Spec.prototype.inlineImports = function(imports, rootDir) {
  return Promise.all(imports.map(function(importNode) {
    var imp = new Import(this, importNode, rootDir || this.rootDir);
    return imp.inline();
  }, this));
};

Spec.prototype.buildSyntax = function() {
  var syntaxes = this.doc.querySelectorAll('EMU-GRAMMAR');
  for(var i = 0; i < syntaxes.length; i++) {
    syntaxes[i].innerHTML = gmdCompile(syntaxes[i].textContent);
  }
}
Spec.prototype.buildClauses = function() {
  var clauses = Array.prototype.slice.call(
    this.doc.querySelectorAll('EMU-INTRO, EMU-CLAUSE, EMU-ANNEX')
  );

  clauses.forEach(function(clauseNode) {
    var clause = new Clause(this, clauseNode);
    clause.build();
  }, this);
};

Spec.prototype.buildToc = function() {
  var html = buildToc(this);
  var tocContainer = this.doc.createElement('div');
  tocContainer.innerHTML = '<h2>Table of Contents</h2>' + html;
  var intro = this.doc.querySelector('emu-intro, emu-clause');
  intro.parentNode.insertBefore(tocContainer, intro);
};

Spec.prototype.getNextClauseNumber = function(depth, isAnnex) {
  return this._numberer.next(depth, isAnnex).value;
};

Spec.prototype.buildProductions = function() {
  var prods = this.doc.querySelectorAll('emu-production');
  var prodRefs = this.doc.querySelectorAll('emu-prodref');
  var prodsByName = {};

  // build Productions
  for(var i = 0; i < prods.length; i++) {
    var prod = new Production(this, prods[i]);
    prod.build();
    // Multiple productions may be present. Only allow referencing the first.
    if(!prodsByName[prod.name]) {
      prodsByName[prod.name] = prod;
    }
  }

  // replace prodRefs with referenced clause
  for(var i =  0; i < prodRefs.length; i++) {
    var ref = prodRefs[i];
    var prod = prodsByName[ref.getAttribute('name')];
    var copy;

    if(!prod) {
      console.error('Could not find production named ' + ref.getAttribute('name'));
      continue;
    }

    if(ref.hasAttribute('a')) {
      if(!prod.rhsesById[ref.getAttribute('a')]) {
        console.error('Could not find alternative ' + ref.getAttribute('a') + ' of production ' + prod.name);
        continue;
      }

      copy = prod.node.cloneNode(false);

      // copy nodes until the first RHS. This captures the non-terminal name and any annotations.
      for(var j = 0; j < prod.node.childNodes.length; j++) {
        if(prod.node.childNodes[j].nodeName === 'EMU-RHS') break;

        copy.appendChild(prod.node.childNodes[j].cloneNode(true));
      }

      copy.appendChild(prod.rhsesById[ref.getAttribute('a')].node.cloneNode(true));
    } else {
      copy = prod.node.cloneNode(true);
    }

    ref.parentNode.replaceChild(copy, ref);

    // copy attributes over (especially important for "class").
    for(var j = 0; j < ref.attributes.length; j++) {
      var attr = ref.attributes[j];

      if(!copy.hasAttribute(attr.name)) {
        copy.setAttribute(attr.name, attr.value);
      }
    }
  }
};

Spec.prototype.highlightCode = function() {
  var codes = this.doc.querySelectorAll('pre code');
  for(var i = 0; i < codes.length; i++) {
    hljs.highlightBlock(codes[i]);
  }
}


function buildToc(spec, level) {
  level = level || spec;

  var html = '<ol class="toc">';

  level.subclauses.forEach(function(sub) {
    html += '<li><a href="#' + sub.id + '"><span class="secnum">' + sub.number + '</span> ' + emd.fragment(sub.title) + '</a>';
    if(sub.subclauses.length > 0) html += buildToc(spec, sub);
    html += '</li>';
  });

  html += '</ol>';

  return html;
}
