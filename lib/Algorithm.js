'use strict';

const Builder = require('./Builder');
const emd = require('ecmarkdown');

module.exports = class Algorithm extends Builder {
  build() {
    const contents = this.node.innerHTML;
    let html = emd.document(contents);

    html = html.replace(/([A-Z]\w+)\(/g, function (match, name) {
      let op = this.spec.biblio.ops[name];
      if (!op) op = this.spec.externalBiblio.ops[name];
      if (!op) return match;

      return '<a href="' + op.location + '#' + op.id + '">' + name + '</a>(';
    }.bind(this));

    this.node.innerHTML = html;
  }
};
