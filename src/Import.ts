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

  // clone this list so we can walk it after the replaceWith call
  const importedNodes = [...importDoc.body.childNodes];
  const frag = spec.doc.createDocumentFragment();

  for (let i = 0; i < importedNodes.length; i++) {
    const importedNode = spec.doc.adoptNode(importedNodes[i]);
    importedNodes[i] = importedNode;
    frag.appendChild(importedNode);

    spec.topLevelImportedNodes.set(importedNode, importNode);
  }

  importNode.replaceWith(frag);

  for (let i = 0; i < importedNodes.length; i++) {
    const importedNode = importedNodes[i];
    if (importedNode.nodeType === 1 /* Node.ELEMENT_NODE */) {
      const importedImports = [
        ...(importedNode as HTMLElement).querySelectorAll('emu-import'),
        // we have to do this because querySelectorAll can't return its `this`
        ...((importedNode as HTMLElement).tagName === 'EMU-IMPORT' ? [importedNode] : []),
      ];
      for (const childImport of importedImports) {
        await buildImports(spec, childImport as EmuImportElement, relativeRoot);
      }
    }
  }
}

export interface EmuImportElement extends HTMLElement {
  href: string;
  dom: JSDOM;
  source?: string;
  importPath?: string;
}
