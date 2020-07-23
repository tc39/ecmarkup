import type Spec from './Spec';
import type Clause from './Clause';
import type { Context } from './Context';

import Builder from './Builder';

/*@internal*/
export default class Example extends Builder {
  clause: Clause;
  caption: string | null;
  id: string | undefined;
  static elements = ['EMU-EXAMPLE'];

  constructor(spec: Spec, node: HTMLElement, clause: Clause) {
    super(spec, node);
    this.clause = clause;
    this.caption = this.node.getAttribute('caption');
    if (this.node.hasAttribute('id')) {
      this.id = this.node.getAttribute('id')!;
    }
  }

  static enter({ spec, node, clauseStack }: Context) {
    const clause = clauseStack[clauseStack.length - 1];
    if (!clause) return; // don't process examples outside of clauses
    clause.examples.push(new Example(spec, node, clause));
  }

  build(number?: number) {
    if (this.id) {
      // biblio is added during the build step as we don't know
      // the number at build time. Could probably be fixed.
      this.spec.biblio.add({
        type: 'example',
        id: this.id,
        node: this.node,
        number: number || 1,
        clauseId: this.clause.id,
        referencingIds: [],
      });
    }

    this.node.innerHTML = '<figure>' + this.node.innerHTML + '</figure>';

    let caption = 'Example';
    if (number) {
      caption += ' ' + number;
    }

    caption += ' (Informative)';

    if (this.caption) {
      caption += ': ' + this.caption;
    }

    const captionElem = this.spec.doc.createElement('figcaption');
    captionElem.textContent = caption;
    this.node.childNodes[0].insertBefore(captionElem, this.node.childNodes[0].firstChild);
  }
}
