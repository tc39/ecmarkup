import utils = require('./utils');
import Path = require('path');
import Promise = require('bluebird');
import Builder = require('./Builder');

/*@internal*/
class Import extends Builder {
  build(rootDir: string): PromiseLike<any> {
    const href = this.node.getAttribute('href');
    const importPath = Path.join(rootDir || this.spec.rootDir, href);
    this.spec.imports.push(importPath);

    return this.spec.fetch(importPath)
      .then(utils.htmlToDoc)
      .then(importDoc => {
        const nodes = importDoc.body.childNodes;
        const parent = this.node.parentNode;
        const frag = this.spec.doc.createDocumentFragment();

        for (let i = 0; i < nodes.length; i++) {
          const node = nodes[i];
          const importedNode = this.spec.doc.importNode(node, true);
          frag.appendChild(importedNode);
        }

        const imports = frag.querySelectorAll('emu-import') as NodeListOf<HTMLElement>;
        this.node.appendChild(frag);

        return this.spec.buildAll(imports, Import, { buildArgs: [Path.dirname(importPath)] });
      });
  }
}

/*@internal*/
export = Import;