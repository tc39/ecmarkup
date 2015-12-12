'use strict';

module.exports = class Terminal {
  constructor(spec, prod, node) {
    this.spec = spec;
    this.production = prod;
    this.node = node;

    this.optional = node.hasAttribute('optional');
  }

  build() {
    let modifiers = '';

    if (this.optional) {
      modifiers += '<emu-opt>opt</emu-opt>';
    }

    if (modifiers === '') return null;

    const el = this.spec.doc.createElement('emu-mods');
    el.innerHTML = modifiers;

    this.node.appendChild(el);
  }
};
