import type { PartialBiblioEntry } from './Biblio';
import type { Context } from './Context';

import Builder from './Builder';

/*@internal*/
export default class Dfn extends Builder {
  static async enter({ spec, node, clauseStack }: Context) {
    const parentClause = clauseStack[clauseStack.length - 1];
    if (!parentClause) return;

    const entry: PartialBiblioEntry = {
      type: 'term',
      term: node.textContent!,
      refId: parentClause.id,
    };

    if (node.hasAttribute('id')) {
      entry.id = node.id;
    }

    if (node.hasAttribute('variants')) {
      entry.variants = node
        .getAttribute('variants')!
        .split(',')
        .map(v => v.trim());
    }

    spec.biblio.add(entry, parentClause.namespace);
  }

  static elements = ['DFN'];
}
