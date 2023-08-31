import type { PartialBiblioEntry, TermBiblioEntry } from './Biblio';
import { getKeys } from './Biblio';
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

    const keys = getKeys(entry as TermBiblioEntry);
    const existing = spec.biblio.keysForNamespace(parentClause.namespace);
    for (const [index, key] of keys.entries()) {
      if (keys.indexOf(key) !== index) {
        spec.warn({
          type: 'node',
          node,
          ruleId: 'duplicate-definition',
          message: `${JSON.stringify(key)} is defined more than once in this definition`,
        });
      }
      if (existing.has(key)) {
        spec.warn({
          type: 'node',
          node,
          ruleId: 'duplicate-definition',
          message: `duplicate definition ${JSON.stringify(key)}`,
        });
      }
    }

    spec.biblio.add(entry, parentClause.namespace);
  }

  static elements = ['DFN'];
}
