'use strict';

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
var Xref = require('./Xref');
var hljs = require('highlight.js');
var emd = require('ecmarkdown');
var gmd = require('grammarkdown');
var Grammar = gmd.Grammar;
var EmitFormat = gmd.EmitFormat;

var gmdCompile = function (text) {
  var out;
  function readFile(file) { return text; }
  function writeFile(file, output) { out = output; }
  var g = new Grammar(['file.grammar'], { format: EmitFormat.ecmarkup }, readFile);
  g.emit(undefined, writeFile);

  return out;
};

function Spec(rootPath, fetch, doc, opts) {
  opts = opts || {};

  this.spec = this;
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
    productions: {},
    terms: {}
  };
  this.biblio = {
    clauses: {},
    ops: {},
    productions: {},
    terms: {}
  };

  this.processMetadata();
  assign(this.opts, opts);

  if (!this.opts.hasOwnProperty('toc')) {
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
    data = yaml.safeLoad(block.textContent);
  } catch (e) {
    console.log('Warning: metadata block failed to parse');
    return;
  } finally {
    block.parentNode.removeChild(block);
  }

  assign(this.opts, data);
};

Spec.prototype.build = function () {
  var s = Date.now();
  var p = this.inlineAllImports()
    .then(this.loadES6Biblio.bind(this))
    .then(this.loadBiblios.bind(this))
    .then(this.buildClauses.bind(this))
    .then(this.buildSyntax.bind(this))
    .then(this.buildAlgs.bind(this))
    .then(this.buildProductions.bind(this))
    .then(this.highlightCode.bind(this))
    .then(this.buildDfns.bind(this))
    .then(this.autolink.bind(this))
    .then(this.buildXrefs.bind(this));

  if (this.opts.toc) {
    p = p.then(this.buildToc.bind(this));
  }

  return p.then(function () { return this; }.bind(this));
};

Spec.prototype.toHTML = function () {
  return '<!doctype html>\n' + this.doc.documentElement.innerHTML;
};

Spec.prototype.buildAlgs = function () {
  var algs = this.doc.querySelectorAll('emu-alg');
  var builders = [];

  // initialize first to collect any aoids
  for (var i = 0; i < algs.length; i++) {
    builders.push(new Algorithm(this, algs[i]));
  }

  // build each
  builders.forEach(function (b) { b.build(); });
};

function importBiblio(target, source) {
  Object.keys(source).forEach(function (site) {
    Object.keys(source[site]).forEach(function (type) {
      Object.keys(source[site][type]).forEach(function (entry) {
        target[type][entry] = source[site][type][entry];
        target[type][entry].location = site;
      });
    });
  });
}

Spec.prototype.loadES6Biblio = function () {
  this._log('Loading biblios...');

  return this.fetch(Path.join(__dirname, '../es6biblio.json'))
    .then(function (es6bib) {
      importBiblio(this.externalBiblio, JSON.parse(es6bib));
    }.bind(this));
};

// biblio paths are always relative to root document
Spec.prototype.loadBiblios = function () {
  var spec = this;

  var bibs = Array.prototype.slice.call(this.doc.querySelectorAll('emu-biblio'));

  return Promise.all(
    bibs.map(function (bib) {
      var path = Path.join(spec.rootDir, bib.getAttribute('href'));

      return spec.fetch(path)
        .then(function (contents) {
          importBiblio(spec.externalBiblio, JSON.parse(contents));
        });
    })
    );
};

Spec.prototype.exportBiblio = function () {
  if (!this.opts.location) {
    console.log('Warning: no spec location specified. Biblio not generated. Try --location or setting the location in the document\'s metadata block.');
    return {};
  }

  var biblio = {};
  biblio[this.opts.location] = this.biblio;

  return biblio;
};

Spec.prototype.inlineAllImports = function () {
  this._log('Inlining imports...');

  var imports = this.doc.querySelectorAll('emu-import');
  imports = Array.prototype.slice.call(imports);

  return this.inlineImports(imports);
};

Spec.prototype.inlineImports = function (imports, rootDir) {
  return Promise.all(imports.map(function (importNode) {
    var imp = new Import(this, importNode, rootDir || this.rootDir);
    return imp.inline();
  }, this));
};

Spec.prototype.buildSyntax = function () {
  this._log('Building emu-grammar...');
  var syntaxes = this.doc.querySelectorAll('EMU-GRAMMAR');
  for (var i = 0; i < syntaxes.length; i++) {
    syntaxes[i].innerHTML = gmdCompile(syntaxes[i].textContent);
  }
};

Spec.prototype.buildClauses = function () {
  this._log('Building emu-clauses...');
  var clauses = Array.prototype.slice.call(
    this.doc.querySelectorAll('EMU-INTRO, EMU-CLAUSE, EMU-ANNEX')
    );

  clauses.forEach(function (clauseNode) {
    var clause = new Clause(this, clauseNode);
    clause.build();
  }, this);
};

Spec.prototype.buildToc = function () {
  this._log('Building table of contents...');
  if (this.subclauses.length === 0) {
    return;
  }

  var html = buildToc(this);
  var tocContainer = this.doc.createElement('div');
  tocContainer.innerHTML = '<h2>Table of Contents</h2>' + html;
  var intro = this.doc.querySelector('emu-intro, emu-clause, emu-annex');
  intro.parentNode.insertBefore(tocContainer, intro);
};

Spec.prototype.getNextClauseNumber = function (depth, isAnnex) {
  return this._numberer.next(depth, isAnnex).value;
};

Spec.prototype.buildProductions = function () {
  this._log('Building emu-productions...');
  var prods = this.doc.querySelectorAll('emu-production');
  var prodRefs = this.doc.querySelectorAll('emu-prodref');
  var prodsByName = {};

  // build Productions
  for (var i = 0; i < prods.length; i++) {
    var prod = new Production(this, prods[i]);
    prod.build();
    // Multiple productions may be present. Only allow referencing the first.
    if (!prodsByName[prod.name]) {
      prodsByName[prod.name] = prod;
    }
  }

  // replace prodRefs with referenced clause
  for (var i = 0; i < prodRefs.length; i++) {
    var ref = prodRefs[i];
    var prod = prodsByName[ref.getAttribute('name')];
    var copy;

    if (!prod) {
      console.error('Could not find production named ' + ref.getAttribute('name'));
      continue;
    }

    if (ref.hasAttribute('a')) {
      if (!prod.rhsesById[ref.getAttribute('a')]) {
        console.error('Could not find alternative ' + ref.getAttribute('a') + ' of production ' + prod.name);
        continue;
      }

      copy = prod.node.cloneNode(false);

      // copy nodes until the first RHS. This captures the non-terminal name and any annotations.
      for (var j = 0; j < prod.node.childNodes.length; j++) {
        if (prod.node.childNodes[j].nodeName === 'EMU-RHS') break;

        copy.appendChild(prod.node.childNodes[j].cloneNode(true));
      }

      copy.appendChild(prod.rhsesById[ref.getAttribute('a')].node.cloneNode(true));
    } else {
      copy = prod.node.cloneNode(true);
    }

    ref.parentNode.replaceChild(copy, ref);

    // copy attributes over (especially important for 'class').
    for (var j = 0; j < ref.attributes.length; j++) {
      var attr = ref.attributes[j];

      if (!copy.hasAttribute(attr.name)) {
        copy.setAttribute(attr.name, attr.value);
      }
    }
  }
};

Spec.prototype.highlightCode = function () {
  this._log('Highlighting syntax...');
  var codes = this.doc.querySelectorAll('pre code');
  for (var i = 0; i < codes.length; i++) {
    hljs.highlightBlock(codes[i]);
  }
};

Spec.prototype.buildXrefs = function () {
  this._log('Building emu-xrefs...');
  var xrefs = this.doc.querySelectorAll('emu-xref');

  for (var i = 0; i < xrefs.length; i++) {
    var xref = new Xref(this, xrefs[i]);
    xref.build();
  }
};

Spec.prototype.buildDfns = function () {
  this._log('Building dfns...');
  var dfns = this.doc.querySelectorAll('dfn');

  for (var i = 0; i < dfns.length; i++) {
    var dfn = dfns[i];
    var parentClause = parent(dfn, ['EMU-CLAUSE', 'EMU-INTRO', 'EMU-ANNEX']);
    if (!parentClause) continue;

    this.biblio.terms[dfn.textContent] = {
      id: parentClause.id,
      location: ''
    };
  }
};

var NO_CLAUSE_AUTOLINK = ['PRE', 'CODE', 'EMU-CLAUSE', 'EMU-ALG', 'EMU-PRODUCTION', 'EMU-GRAMMAR', 'EMU-XREF', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6'];
var clauseTextNodesUnder = utils.textNodesUnder(NO_CLAUSE_AUTOLINK);
var NO_ALG_AUTOLINK = ['PRE', 'CODE', 'EMU-XREF'];
var algTextNodesUnder = utils.textNodesUnder(NO_ALG_AUTOLINK);

Spec.prototype.autolink = function () {
  this._log('Autolinking terms and abstract ops...');
  var termlinkmap = {};
  var autolinkmap = {};

  Object.keys(this.externalBiblio.terms).forEach(function (term) {
    autolinkmap[term.toLowerCase()] = this.externalBiblio.terms[term].id;
    termlinkmap[term.toLowerCase()] = this.externalBiblio.terms[term].id;
  }, this);
  Object.keys(this.externalBiblio.ops).forEach(function (op) {
    autolinkmap[op.toLowerCase()] = this.externalBiblio.ops[op].id;
  }, this);
  Object.keys(this.biblio.terms).forEach(function (term) {
    autolinkmap[term.toLowerCase()] = this.biblio.terms[term].id;
    termlinkmap[term.toLowerCase()] = this.biblio.terms[term].id;
  }, this);
  Object.keys(this.biblio.ops).forEach(function (op) {
    autolinkmap[op.toLowerCase()] = this.biblio.ops[op].id;
  }, this);

  var clauseReplacer = new RegExp(Object.keys(autolinkmap)
    .sort(function (a, b) { return b.length - a.length; })
    .map(function (k) { return '\\b' + k + '\\b'; })
    .join('|'), 'gi');

  var algReplacer = new RegExp(Object.keys(termlinkmap)
    .sort(function (a, b) { return b.length - a.length; })
    .join('|'), 'gi');

  autolinkWalk(clauseReplacer, autolinkmap, this, this);

  var algs = this.doc.getElementsByTagName('emu-alg');
  for (var i = 0; i < algs.length; i++) {
    var alg = algs[i];
    autolink(algReplacer, termlinkmap, this, alg);
  }
};

function autolinkWalk(replacer, autolinkmap, spec, rootClause) {
  rootClause.subclauses.forEach(function (subclause) {
    autolink(replacer, autolinkmap, spec, subclause.node, subclause.id);
    autolinkWalk(replacer, autolinkmap, spec, subclause);
  });
}

function autolink(replacer, autolinkmap, spec, node, parentId) {
  var textNodes = clauseTextNodesUnder(node);

  for (var i = 0; i < textNodes.length; i++) {
    var node = textNodes[i];

    var template = spec.doc.createElement('template');
    template.innerHTML = node.textContent.replace(replacer, function (match) {
      var entry = autolinkmap[match.toLowerCase()];
      if (!entry || entry === parentId) {
        return match;
      }
      return '<emu-xref href="#' + entry + '">' + match + '</emu-xref>';
    });

    utils.replaceTextNode(node, template);
  }
}

Spec.prototype._log = function () {
  if (!this.opts.verbose) return;
  console.log.apply(console, arguments);
};

function parent(node, types) {
  if (node === null) return null;
  if (types.indexOf(node.nodeName) > -1) return node;
  return parent(node.parentNode, types);
}


function buildToc(spec, level) {
  level = level || spec;

  var html = '<ol class="toc">';

  level.subclauses.forEach(function (sub) {
    html += '<li><a href="#' + sub.id + '"><span class="secnum">' + sub.number + '</span> ' + emd.fragment(sub.title) + '</a>';
    if (sub.subclauses.length > 0) html += buildToc(spec, sub);
    html += '</li>';
  });

  html += '</ol>';

  return html;
}

function assign(target, source) {
  Object.keys(source).forEach(function (k) {
    target[k] = source[k];
  });
}
