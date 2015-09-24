'use strict';
const Builder = require('./Builder');

module.exports = class NonTerminal extends Builder {
  constructor(spec, prod, node) {
    super(spec, node);
    this.production = prod;

    this.params = node.getAttribute('params');
    this.optional = node.hasAttribute('optional');
  }

  build() {
    const name = this.node.textContent;
    const id = 'prod-' + name;
    const entry = this.spec.biblio.productions[id] || this.spec.externalBiblio.productions[id];
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
  }
};
