import type { UnkeyedBiblioEntry } from './Biblio';
import type { Context } from './Context';

import Builder from './Builder';

/*@internal*/
export default class Dfn extends Builder {
  static async enter({ spec, node, clauseStack }: Context) {
    const parentClause = clauseStack[clauseStack.length - 1];
    if (!parentClause) return;

    const entry: UnkeyedBiblioEntry = {
      type: 'term',
      term: node.textContent!,
      refId: parentClause.id,
      referencingIds: [],
    };

    if (node.hasAttribute('id')) {
      entry.id = node.id;
    }

    spec.biblio.add(entry, parentClause.namespace);
  }

  static elements = ['DFN'];
}
