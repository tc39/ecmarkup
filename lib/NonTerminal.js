'use strict';
const Builder = require('./Builder');

module.exports = class NonTerminal extends Builder {
  constructor(spec, node) {
    super(spec, node);

    this.params = node.getAttribute('params');
    this.optional = node.hasAttribute('optional');
  }

  build() {
    const name = this.node.textContent;
    const id = 'prod-' + name;
    const entry = this.spec.biblio.byProductionName(name);
    if (entry) {
      this.node.innerHTML = '<a href="' + entry.location + '#' + entry.id + '">' + name + '</a>';
    } else {
      this.node.innerHTML = name;
    }
    let modifiers = '';

    if (this.params) {
      modifiers += '<emu-params>[' + this.params + ']</emu-params>';
    }

    if (this.optional) {
      modifiers += '<emu-opt>opt</emu-opt>';
    }

    if (modifiers.length > 0) {
      const el = this.spec.doc.createElement('emu-mods');
      el.innerHTML = modifiers;
      this.node.appendChild(el);
    }
  }
};
