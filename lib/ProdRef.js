'use strict';

let Builder = require('./Builder');

module.exports = class ProdRef extends Builder {
  build() {
    const prod = this.spec._prodsByName[this.node.getAttribute('name')];
    let copy;

    if (!prod) {
      console.error('Could not find production named ' + this.node.getAttribute('name'));
      return;
    }

    if (this.node.hasAttribute('a')) {
      if (!prod.rhsesById[this.node.getAttribute('a')]) {
        console.error('Could not find alternative ' + this.node.getAttribute('a') + ' of production ' + prod.name);
        return;
      }

      copy = prod.node.cloneNode(false);

      // copy nodes until the first RHS. This captures the non-terminal name and any annotations.
      for (let j = 0; j < prod.node.childNodes.length; j++) {
        if (prod.node.childNodes[j].nodeName === 'EMU-RHS') break;

        copy.appendChild(prod.node.childNodes[j].cloneNode(true));
      }

      copy.appendChild(prod.rhsesById[this.node.getAttribute('a')].node.cloneNode(true));
    } else {
      copy = prod.node.cloneNode(true);
    }

    this.node.parentNode.replaceChild(copy, this.node);

    // copy attributes over (especially important for 'class').
    for (let j = 0; j < this.node.attributes.length; j++) {
      const attr = this.node.attributes[j];

      if (!copy.hasAttribute(attr.name)) {
        copy.setAttribute(attr.name, attr.value);
      }
    }
  }
};
