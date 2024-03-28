import type Spec from './Spec';
import type Production from './Production';

import Builder from './Builder';

export default class RHS extends Builder {
  /** @internal */ production: Production;
  /** @internal */ constraints: string | null;
  /** @internal */ alternativeId: string | null;

  constructor(spec: Spec, prod: Production, node: HTMLElement) {
    super(spec, node);
    this.production = prod;
    this.node = node;
    this.constraints = node.getAttribute('constraints');
    this.alternativeId = node.getAttribute('a');
  }

  build() {
    if (this.node.textContent === '') {
      this.node.textContent = '[empty]';

      return;
    }

    if (this.constraints) {
      const cs = this.spec.doc.createElement('emu-constraints');
      cs.textContent = '[' + this.constraints + ']';

      this.node.insertBefore(cs, this.node.childNodes[0]);
    }

    this.terminalify(this.node);
  }

  terminalify(parentNode: Element) {
    // we store effects to perform later so the iteration doesn't get messed up
    const surrogateTags = ['INS', 'DEL', 'MARK'];
    const pairs: { parent: Element; child: Text }[] = [];
    for (const node of parentNode.childNodes) {
      if (node.nodeType === 3) {
        pairs.push({ parent: parentNode, child: node as Text });
      } else if (surrogateTags.includes(node.nodeName)) {
        for (const child of node.childNodes) {
          if (child.nodeType === 3) {
            pairs.push({ parent: node as Element, child: child as Text });
          }
        }
      }
    }
    let first = true;
    for (const { parent, child } of pairs) {
      if (!first && !/^\s+$/.test(child.textContent ?? '')) {
        if (parent === parentNode) {
          parentNode.insertBefore(this.spec.doc.createTextNode(' '), child);
        } else {
          // put the space outside of `<ins>` (etc) tags
          parentNode.insertBefore(this.spec.doc.createTextNode(' '), parent);
        }
      }
      first = false;
      this.wrapTerminal(parent, child);
    }
  }

  private wrapTerminal(parentNode: Element, node: Text) {
    const textContent = node.textContent!;
    const text = textContent.trim();

    if (text === '' && textContent.length > 0) {
      // preserve intermediate whitespace
      return;
    }

    const pieces = text.split(/\s/);

    let first = true;
    pieces.forEach(p => {
      if (p.length === 0) {
        return;
      }
      const est = this.spec.doc.createElement('emu-t');
      est.textContent = p;

      parentNode.insertBefore(est, node);
      if (!first) {
        parentNode.insertBefore(this.spec.doc.createTextNode(' '), est);
      }
      first = false;
    });

    parentNode.removeChild(node);
  }
}
