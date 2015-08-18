'use strict';

module.exports = class Builder {
  constructor(spec, node) {
    this.spec = spec;
    this.node = node;
  }

  build() {
    throw new Error('Builder not implemented');
  }
};
