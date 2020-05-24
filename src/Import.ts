import type Spec from './Spec';

import Builder from './Builder';
import * as utils from './utils';
import * as path from 'path';

/*@internal*/
export default class Import extends Builder {
  public importLocation: string;
  public relativeRoot: string;

  constructor(spec: Spec, node: HTMLElement, importLocation: string, relativeRoot: string) {
    super(spec, node);
    this.importLocation = importLocation;
    this.relativeRoot = relativeRoot;
  }

  static async build(spec: Spec, node: HTMLElement, root: string) {
    const href = node.getAttribute('href');
    if (!href) throw new Error('Import missing href attribute.');
    const importPath = path.join(root, href);
    const relativeRoot = path.dirname(importPath);
    const imp = new Import(spec, node, importPath, relativeRoot);
    spec.imports.push(imp);

    const html = await spec.fetch(importPath);
    const importDoc = await utils.htmlToDom(html).window.document;

    const nodes = importDoc.body.childNodes;
    const frag = spec.doc.createDocumentFragment();

    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      const importedNode = spec.doc.importNode(node, true);
      frag.appendChild(importedNode);
    }

    node.appendChild(frag);

    return imp;
  }
}
