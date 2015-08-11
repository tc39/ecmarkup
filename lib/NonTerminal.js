module.exports = NonTerminal;

function NonTerminal(spec, prod, node) {
  this.spec = spec;
  this.production = prod;
  this.node = node;

  this.params = node.getAttribute('params');
  this.optional = node.hasAttribute('optional');
}

NonTerminal.prototype.build = function() {
  var name = this.node.textContent;
  this.node.innerHTML = '<a href="#prod-' + name + '">' + name + '</a>';
  var modifiers = '';

  if(this.params) {
    modifiers += '<emu-params>[' + this.params + ']</emu-params>';
  }

  if(this.optional) {
    modifiers += '<emu-opt>opt</emu-opt>';
  }

  var el = this.spec.doc.createElement('emu-mods');
  el.innerHTML = modifiers;

  this.node.appendChild(el);
};
