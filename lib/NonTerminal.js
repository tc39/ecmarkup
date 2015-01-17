module.exports = NonTerminal;

function NonTerminal(spec, prod, node) {
  this.spec = spec;
  this.production = prod;
  this.node = node;

  this.params = node.getAttribute('params');
  this.optional = node.hasAttribute('optional');
}

NonTerminal.prototype.build = function() {
  var mods = this.production.createModifiersNode(this);
  this.node.insertBefore(mods, null);
};
