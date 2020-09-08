import type Spec from './Spec';

import Builder from './Builder';
import * as utils from './utils';
import * as path from 'path';
import type { JSDOM } from 'jsdom';

/*@internal*/
export default class Import extends Builder {
  public importLocation: string;
  public relativeRoot: string;
  public source: string;

  constructor(
    spec: Spec,
    node: HTMLElement,
    importLocation: string,
    relativeRoot: string,
    source: string
  ) {
    super(spec, node);
    this.importLocation = importLocation;
    this.relativeRoot = relativeRoot;
    this.source = source;
  }

  static async build(spec: Spec, node: EmuImportElement, root: string) {
    const href = node.getAttribute('href');
    if (!href) throw new Error('Import missing href attribute.');
    const importPath = path.join(root, href);
    const relativeRoot = path.dirname(importPath);

    const html = await spec.fetch(importPath);

    const imp = new Import(spec, node, importPath, relativeRoot, html);
    spec.imports.push(imp);

    const importDom = utils.htmlToDom(html);
    node.dom = importDom;
    node.source = html;
    node.importPath = importPath;

    const importDoc = importDom.window.document;
    const nodes = importDoc.body.childNodes;
    const frag = spec.doc.createDocumentFragment();

    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      const importedNode = spec.doc.adoptNode(node);
      frag.appendChild(importedNode);
    }

    node.appendChild(frag);

    return imp;
  }
}

/*@internal*/
export interface EmuImportElement extends HTMLElement {
  href: string;
  dom?: JSDOM;
  source?: string;
  importPath?: string;
}
