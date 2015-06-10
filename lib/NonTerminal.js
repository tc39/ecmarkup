module.exports = NonTerminal;

function NonTerminal(spec, prod, node) {
  this.spec = spec;
  this.production = prod;
  this.node = node;

  this.params = node.getAttribute('params');
  this.optional = node.hasAttribute('optional');
}

NonTerminal.prototype.build = function() {
  var modifiers = '';

  if(this.params) {
    modifiers += ' [' + this.params + ']';
  }

  if(this.optional) {
    modifiers += ' opt';
  }

  if(modifiers === '') return null;
  var el = this.spec.doc.createElement('emu-mods');
  el.textContent = modifiers;

  this.node.appendChild(el);
};
