import type Spec from './Spec';

import * as utils from './utils';
import * as path from 'path';
import type { JSDOM } from 'jsdom';

export type Import = {
  importLocation: string;
  relativeRoot: string;
  source: string;
};

export async function buildImports(spec: Spec, importNode: EmuImportElement, root: string) {
  const href = importNode.getAttribute('href');
  if (!href) throw new Error('Import missing href attribute.');
  const importPath = path.join(root, href);
  const relativeRoot = path.dirname(importPath);

  const html = await spec.fetch(importPath);

  spec.imports.push({ importLocation: importPath, relativeRoot, source: html });

  const importDom = utils.htmlToDom(html);
  importNode.dom = importDom;
  importNode.source = html;
  importNode.importPath = importPath;

  const importDoc = importDom.window.document;
  const nodes = importDoc.body.childNodes;
  const frag = spec.doc.createDocumentFragment();

  for (let i = 0; i < nodes.length; i++) {
    const importedNode = spec.doc.adoptNode(nodes[i]);
    if (importedNode.nodeType === 1 /* Node.ELEMENT_NODE */) {
      // @ts-expect-error this is an element now, we've checked
      for (const childImport of importedNode.querySelectorAll('EMU-IMPORT')) {
        await buildImports(spec, childImport as EmuImportElement, relativeRoot);
      }
    }

    frag.appendChild(importedNode);

    spec.topLevelImportedNodes.set(importedNode, importNode);
  }

  const children = frag.childElementCount;
  importNode.replaceWith(frag);

  // This is a bit gross.
  // We want to do this check after adopting the elements into the main DOM, so the location-finding infrastructure works
  // But `appendChild(documentFragment)` both empties out the original fragment and returns it.
  // So we have to remember how many child elements we are adding and walk over each of them manually.
  // for (let i = node.children.length - children; i < node.children.length; ++i) {
  //   const child = node.children[i];
  //   const biblios = [
  //     ...child.querySelectorAll('emu-biblio'),
  //     ...(child.tagName === 'EMU-BIBLIO' ? [child] : []),
  //   ];
  //   for (const biblio of biblios) {
  //     spec.warn({
  //       type: 'node',
  //       node: biblio,
  //       ruleId: 'biblio-in-import',
  //       message: 'emu-biblio elements cannot be used within emu-imports',
  //     });
  //   }
  // }
}

export interface EmuImportElement extends HTMLElement {
  href: string;
  dom: JSDOM;
  source?: string;
  importPath?: string;
}
