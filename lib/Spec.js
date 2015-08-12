module.exports = Spec;


var Path = require('path');
var yaml = require('js-yaml');
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
  var g = new Grammar(['file.grammar'], { format: EmitFormat.ecmarkup }, readFile);
  g.emit(undefined, writeFile);

  return out;
}

function Spec(rootPath, fetch, doc, opts) {
  opts = opts || {};

  this.opts = {};
  this.rootPath = rootPath;
  this.rootDir = Path.dirname(this.rootPath);
  this.doc = doc;
  this.fetch = fetch;
  this.subclauses = [];
  this._numberer = ClauseNumbers.iterator();
  this.externalBiblio = {
    clauses: {},
    ops: {},
    productions: {}
  };
  this.biblio = {
    clauses: {},
    ops: {},
    productions: {}
  };

  this.processMetadata();
  assign(this.opts, opts);

  if(!this.opts.hasOwnProperty('toc')) {
    this.opts.toc = true;
  }
}

Spec.prototype.processMetadata = function () {
  var block = this.doc.querySelector('pre.metadata');
  if (!block) {
    return;
  }

  var data;
  try {
    data = yaml.safeLoad(block.textContent)
  } catch (e) {
    console.log("Warning: metadata block failed to parse")
    return;
  } finally {
    block.parentNode.removeChild(block);
  }

  assign(this.opts, data);
}

Spec.prototype.build = function() {
  var s = Date.now();
  var p = this.inlineAllImports()
    .then(this.loadES6Biblio.bind(this))
    .then(this.loadBiblios.bind(this))
    .then(this.buildClauses.bind(this))
    .then(this.buildSyntax.bind(this))
    .then(this.buildAlgs.bind(this))
    .then(this.buildProductions.bind(this))
    .then(this.highlightCode.bind(this))
    .then(this.buildXrefs.bind(this))

  if(this.opts.toc) {
    p = p.then(this.buildToc.bind(this))
  }

  return p.then(function () { return this }.bind(this))
};

Spec.prototype.toHTML = function() {
  return '<!doctype html>\n' + this.doc.documentElement.innerHTML;
}

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

function importBiblio(target, source) {
  Object.keys(source).forEach(function(site) {
    Object.keys(source[site]).forEach(function(type) {
      Object.keys(source[site][type]).forEach(function(entry) {
        target[type][entry] = source[site][type][entry];
        target[type][entry].location = site;
      });
    });
  });
}
Spec.prototype.loadES6Biblio = function() {
  return this.fetch(Path.join(__dirname, '../es6biblio.json'))
    .then(function(es6bib) {
      importBiblio(this.externalBiblio, JSON.parse(es6bib));
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
          importBiblio(spec.externalBiblio, JSON.parse(contents));
        });
    })
  );
};

Spec.prototype.exportBiblio = function() {
  if(!this.opts.location) {
    console.log("Warning: no spec location specified. Biblio not generated. Try --location or setting the location in the document's metadata block.");
    return {};
  }

  var biblio = {};
  biblio[this.opts.location] = this.biblio;

  return biblio;
}

Spec.prototype.inlineAllImports = function() {
  var imports = this.doc.querySelectorAll('emu-import');
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
  if(this.subclauses.length === 0) {
    return;
  }

  var html = buildToc(this);
  var tocContainer = this.doc.createElement('div');
  tocContainer.innerHTML = '<h2>Table of Contents</h2>' + html;
  var intro = this.doc.querySelector('emu-intro, emu-clause, emu-annex');
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

    // copy attributes over (especially important for 'class').
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

Spec.prototype.buildXrefs = function() {
  var xrefs = this.doc.querySelectorAll('emu-xref');

  for(var i = 0; i < xrefs.length; i++) {
    var xref = xrefs[i];
    var href = xref.getAttribute('href');
    if(!href) {
      console.log('Warning: xref has no href.')
      continue;
    }

    if(href[0] !== '#') {
      console.log('Warning: xref to anything other than a fragment id is not supported (is ' + href + '). Try href="#sec-id" instead.');
      continue;
    }

    var entry = this.biblio.clauses[href.slice(1)] || this.externalBiblio.clauses[href.slice(1)];

    if(!entry) {
      console.log('Warning: can\'t find clause with id ' + href);
      continue;
    }

    if(xref.textContent.trim() === '') {
      if(xref.hasAttribute('title')) {
        xref.innerHTML = '<a href="' + entry.location + '#' + entry.id + '">' + entry.title + '</a>';
      } else {
        xref.innerHTML = '<a href="' + entry.location + '#' + entry.id + '">' + entry.number + '</a>';
      }
    } else {
      xref.innerHTML = '<a href="' + entry.location + '#' + entry.id + '">' + xref.innerHTML + '</a>';
    }
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

function assign(target, source) {
  Object.keys(source).forEach(function(k) {
    target[k] = source[k];
  })
}
