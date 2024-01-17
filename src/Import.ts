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
    source: string,
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

    const children = frag.childElementCount;
    node.appendChild(frag);

    // This is a bit gross.
    // We want to do this check after adopting the elements into the main DOM, so the location-finding infrastructure works
    // But `appendChild(documentFragment)` both empties out the original fragment and returns it.
    // So we have to remember how many child elements we are adding and walk over each of them manually.
    for (let i = node.children.length - children; i < node.children.length; ++i) {
      const child = node.children[i];
      const biblios = [
        ...child.querySelectorAll('emu-biblio'),
        ...(child.tagName === 'EMU-BIBLIO' ? [child] : []),
      ];
      for (const biblio of biblios) {
        spec.warn({
          type: 'node',
          node: biblio,
          ruleId: 'biblio-in-import',
          message: 'emu-biblio elements cannot be used within emu-imports',
        });
      }
    }

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
