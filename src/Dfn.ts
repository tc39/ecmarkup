import Builder from './Builder';
import type { TermBiblioEntry } from './Biblio';
import type { Context } from './Context';

/*@internal*/
export default class Dfn extends Builder {
  static enter({spec, node, clauseStack}: Context) {
    const parentClause = clauseStack[clauseStack.length - 1];
    if (!parentClause) return;

    const entry: TermBiblioEntry = {
      type: 'term',
      term: node.textContent!,
      refId: parentClause.id,
      referencingIds: []
    };

    if (node.hasAttribute('id')) {
      entry.id = node.id;
    }

    spec.biblio.add(entry, parentClause.namespace);
  }

  static elements = ['DFN'];
}
