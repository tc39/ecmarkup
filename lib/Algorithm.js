'use strict';

const Builder = require('./Builder');
const emd = require('ecmarkdown');

module.exports = class Algorithm extends Builder {
  build() {
    const contents = this.node.innerHTML;
    let html = emd.document(contents);
    this.node.innerHTML = html;
  }
};
