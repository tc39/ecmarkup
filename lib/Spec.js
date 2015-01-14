module.exports = Spec;

var Path = require('path');
var utils = require('./utils');
var Promise = require('bluebird');
var Import = require('./import');
var Clause = require('./clause');
var ClauseNumbers = require('./clauseNums');
var Algorithm = require('./Algorithm');
var Note = require('./Note');
var Production = require('./Production');

function Spec(rootPath, fetch, doc) {
  this.rootPath = rootPath;
  this.rootDir = Path.dirname(this.rootPath);
  this.doc = doc;
  this.fetch = fetch;
  this.subclauses = [];
  this._numberer = ClauseNumbers.iterator();
  this.externalBiblio = {
    ops: {}
  }
  this.biblio = {
    ops: {}
  }
}

Spec.prototype.build = function() {
  var s = Date.now();
  return this.inlineAllImports()
    .then(this.loadBiblios.bind(this))
    .then(this.buildClauses.bind(this))
    .then(this.buildToc.bind(this))
    .then(this.buildAlgs.bind(this))
    .then(this.buildNotes.bind(this))
    .then(this.buildProductions.bind(this))
    .then(function() {
      return '<!doctype html>\n' + this.doc.documentElement.innerHTML;
    }.bind(this))
}

Spec.prototype.buildNotes = function() {
  var notes = this.doc.querySelectorAll('emu-note');
  for(var i = 0; i < notes.length; i++) {
    new Note(this, notes[i]).build();
  }
}

Spec.prototype.buildAlgs = function() {
  var algs = this.doc.querySelectorAll('emu-alg');
  var builders = [];

  // initialize first to collect any aoids
  for(var i = 0; i < algs.length; i++) {
    builders.push(new Algorithm(this, algs[i]));
  }

  // build each
  builders.forEach(function(b) { b.build() })
}

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
              spec.externalBiblio.ops[alg] = site + ops[alg]
            })
          })
        })
    })
  )
}

Spec.prototype.inlineAllImports = function() {
  var imports = this.doc.querySelectorAll('link[rel=import]');
  imports = Array.prototype.slice.call(imports);

  return this.inlineImports(imports);
}

Spec.prototype.inlineImports = function(imports, rootDir) {
  return Promise.all(imports.map(function(importNode) {
    var imp = new Import(this, importNode, rootDir || this.rootDir);
    return imp.inline();
  }, this))
}

Spec.prototype.buildClauses = function() {
  var clauses = Array.prototype.slice.call(
    this.doc.querySelectorAll('EMU-INTRO, EMU-CLAUSE, EMU-ANNEX')
  );

  clauses.forEach(function(clauseNode) {
    var clause = new Clause(this, clauseNode);
    clause.build();
  }, this)
}

Spec.prototype.buildToc = function() {
  var html = buildToc(this);
  var tocContainer = this.doc.createElement('div');
  tocContainer.innerHTML = '<h2>Table of Contents</h2>' + html;
  var intro = this.doc.querySelector('emu-intro, emu-clause');
  intro.parentNode.insertBefore(tocContainer, intro);
}

Spec.prototype.getNextClauseNumber = function(depth, isAnnex) {
  return this._numberer.next(depth, isAnnex).value;
}

Spec.prototype.buildProductions = function() {
  var prods = this.doc.querySelectorAll('emu-production');

  for(var i = 0; i < prods.length; i++) {
    new Production(this, prods[i]).build();
  }
}


function buildToc(spec, level) {
  level = level || spec;

  var html = '<ol class="toc">'

  level.subclauses.forEach(function(sub) {
    html += '<li><a href="#' + sub.id + '"><span class="secnum">' + sub.number + '</span> ' + sub.title + '</a>';
    if(sub.subclauses.length > 0) html += buildToc(spec, sub);
    html += '</li>'
  })

  html += '</ol>';

  return html;
}


