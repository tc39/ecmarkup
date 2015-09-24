'use strict';
module.exports = Terminal;

function Terminal(spec, prod, node) {
  this.spec = spec;
  this.production = prod;
  this.node = node;

  this.optional = node.hasAttribute('optional');
}

Terminal.prototype.build = function () {
  let modifiers = '';

  if (this.optional) {
    modifiers += '<emu-opt>opt</emu-opt>';
  }

  if (modifiers !== '') {
    const el = this.spec.doc.createElement('emu-mods');
    el.innerHTML = modifiers;

    this.node.appendChild(el);
  }

  // To break line if it's overflowed.

  const nextSibling = this.node.nextSibling;
  // Chrome does not make new line at \u200B.
  this.node.parentNode.insertBefore(
    this.spec.doc.createElement('wbr'),
    nextSibling);
  // IE does not make new line at <wbr>.
  this.node.parentNode.insertBefore(
    this.spec.doc.createTextNode('\u200B'),
    nextSibling);
};
