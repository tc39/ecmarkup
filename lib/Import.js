'use strict';
const utils = require('./utils');
const Path = require('path');
const Promise = require('bluebird');
const Builder = require('./Builder');

module.exports = class Import extends Builder {
  build(rootDir) {
    const href = this.node.getAttribute('href');
    const importPath = Path.join(rootDir || this.spec.rootDir, href);

    return this.spec.fetch(importPath)
      .then(utils.htmlToDoc)
      .then(function (importDoc) {
        const nodes = importDoc.body.childNodes;
        const parent = this.node.parentNode;
        const frag = this.spec.doc.createDocumentFragment();

        for (let i = 0; i < nodes.length; i++) {
          const node = nodes[i];
          const importedNode = this.spec.doc.importNode(node, true);
          frag.appendChild(importedNode);
        }

        const imports = frag.querySelectorAll('emu-import');
        this.node.appendChild(frag);

        return this.spec.buildAll(imports, Import, { buildArgs: [Path.dirname(importPath)] });
      }.bind(this));
  }
};
