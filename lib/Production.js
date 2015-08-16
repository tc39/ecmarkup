'use strict';

module.exports = Production;
var RHS = require('./RHS');
var GrammarAnnotation = require('./GrammarAnnotation');
var NonTerminal = require('./NonTerminal');
var Terminal = require('./Terminal');

function Production(spec, node) {
  this.spec = spec;
  this.node = node;
  this.type = node.getAttribute('type');
  this.name = node.getAttribute('name');
  this.params = node.getAttribute('params');
  this.optional = node.hasAttribute('optional');
  this.oneOf = node.hasAttribute('oneof');
  this.rhses = [];
  this.rhsesById = {};

  var rhses = this.node.querySelectorAll('emu-rhs');
  for (var i = 0; i < rhses.length; i++) {
    var rhs = new RHS(this.spec, this, rhses[i]);
    this.rhses.push(rhs);

    if (rhs.alternativeId) {
      this.rhsesById[rhs.alternativeId] = rhs;
    }
  }

  var id = 'prod-' + this.name;
  if (!this.spec.biblio.productions[id]) {
    this.id = id;
    this.primary = true;
    this.spec.biblio.productions[this.id] = { id: id, location: '', name: this.name };
  }
}

Production.prototype.build = function () {
  var ntNode = this.spec.doc.createElement('emu-nt');
  ntNode.innerHTML = '<a href="#prod-' + this.name + '">' + this.name + '</a>';
  if (this.params) ntNode.setAttribute('params', this.params);
  if (this.optional) ntNode.setAttribute('optional');
  this.node.insertBefore(ntNode, this.node.children[0]);

  var geq = this.spec.doc.createElement('emu-geq');
  if (this.type === 'lexical') {
    geq.textContent = '::';
  } else if (this.type === 'numeric') {
    geq.textContent = ':::';
  } else {
    geq.textContent = ':';
  }

  this.node.insertBefore(geq, ntNode.nextSibling);

  if (this.oneOf) {
    var elem = this.spec.doc.createElement('emu-oneof');
    elem.textContent = 'one of';
    this.node.insertBefore(elem, geq.nextSibling);
  }

  this.rhses.forEach(function (rhs) {
    rhs.build();
  });

  var ganns = this.node.querySelectorAll('emu-gann');
  for (var i = 0; i < ganns.length; i++) {
    new GrammarAnnotation(this.spec, this, ganns[i]).build();
  }

  var nts = this.node.querySelectorAll('emu-nt');
  for (var i = 0; i < nts.length; i++) {
    new NonTerminal(this.spec, this, nts[i]).build();
  }

  var ts = this.node.querySelectorAll('emu-t');
  for (var i = 0; i < ts.length; i++) {
    new Terminal(this.spec, this, ts[i]).build();
  }

  if (this.primary) {
    this.node.setAttribute('id', this.id);
  }
};
