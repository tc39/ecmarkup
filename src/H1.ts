import Builder from './Builder';
import type { Context } from './Context';

export default class H1 extends Builder {
  static elements = ['H1'];

  static async enter() {
    // do nothing
  }

  static async exit({ spec, node, clauseStack }: Context) {
    const parent = clauseStack[clauseStack.length - 1] || null;
    if (parent === null || parent.header !== node) {
      return;
    }
    const headerClone = node.cloneNode(true) as Element;
    for (const a of headerClone.querySelectorAll('a')) {
      a.replaceWith(...a.childNodes);
    }
    parent.titleHTML = headerClone.innerHTML;
    parent.title = headerClone.textContent;
    if (parent.number) {
      const numElem = spec.doc.createElement('span');
      numElem.setAttribute('class', 'secnum');
      numElem.textContent = parent.number;
      node.insertBefore(spec.doc.createTextNode(' '), node.firstChild);
      node.insertBefore(numElem, node.firstChild);
    }
  }
}
