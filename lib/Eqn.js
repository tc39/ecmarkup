'use strict';
const Algorithm = require('./Algorithm');
const emd = require('ecmarkdown');
module.exports = class Eqn extends Algorithm {
  constructor(spec, node) {
    super(spec, node);
    this.aoid = node.getAttribute('aoid');
    this.id = this.aoid;
    this.spec.biblio.ops[this.aoid] = {
      aoid: this.aoid,
      id: this.id,
      location: '',
    };
  }

  build() {
    let contents = emd.fragment(this.node.innerHTML);
    contents = '<div>' + contents.split(/\r?\n/g)
                                 .filter(function(s) { return s.trim().length > 0; })
                                 .join('</div><div>');
    this.node.innerHTML = this.autolinkOps(contents);
  }
};
