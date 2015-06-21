module.exports = Terminal;

function Terminal(spec, prod, node) {
  this.spec = spec;
  this.production = prod;
  this.node = node;

  this.optional = node.hasAttribute('optional');
}

Terminal.prototype.build = function() {
  var modifiers = '';

  if(this.optional) {
    modifiers += '<emu-opt>opt</emu-opt>';
  }

  if(modifiers === '') return null;

  var el = this.spec.doc.createElement('emu-mods');
  el.innerHTML = modifiers;

  this.node.appendChild(el);
};
