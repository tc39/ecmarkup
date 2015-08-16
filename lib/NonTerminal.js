'use strict';

module.exports = NonTerminal;

function NonTerminal(spec, prod, node) {
  this.spec = spec;
  this.production = prod;
  this.node = node;

  this.params = node.getAttribute('params');
  this.optional = node.hasAttribute('optional');
}

NonTerminal.prototype.build = function () {
  var name = this.node.textContent;
  var id = 'prod-' + name;
  var entry = this.spec.biblio.productions[id] || this.spec.externalBiblio.productions[id];
  if (entry) {
    this.node.innerHTML = '<a href="' + entry.location + '#' + entry.id + '">' + name + '</a>';
  } else {
    this.node.innerHTML = name;
  }
  var modifiers = '';

  if (this.params) {
    modifiers += '<emu-params>[' + this.params + ']</emu-params>';
  }

  if (this.optional) {
    modifiers += '<emu-opt>opt</emu-opt>';
  }

  var el = this.spec.doc.createElement('emu-mods');
  el.innerHTML = modifiers;

  this.node.appendChild(el);
};
