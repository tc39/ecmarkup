'use strict';

const Builder = require('./builder');

module.exports = class GrammarAnnotation extends Builder {
  constructor(spec, prod, node) {
    super(spec, node);
    this.production = prod;
  }

  build() {
    if (this.node.firstChild.nodeType === 3) {
      this.node.firstChild.textContent = '[' + this.node.firstChild.textContent;
    } else {
      const pre = this.spec.doc.createTextNode('[');
      this.node.insertBefore(pre, this.node.children[0]);
    }

    const post = this.spec.doc.createTextNode(']');
    this.node.appendChild(post);
  }
};
