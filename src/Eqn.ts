import type { Context } from './Context';

import Builder from './Builder';
import * as emd from 'ecmarkdown';
import * as utils from './utils';

export default class Eqn extends Builder {
  // @ts-ignore
  private constructor() {
    throw new Error('not actually constructible');
  }

  static async enter(context: Context) {
    const { spec, node, clauseStack } = context;

    const aoid = node.getAttribute('aoid');
    if (aoid) {
      const existing = spec.biblio.keysForNamespace(spec.namespace);
      if (existing.has(aoid)) {
        spec.warn({
          type: 'attr-value',
          attr: 'aoid',
          node,
          ruleId: 'duplicate-definition',
          message: `duplicate definition ${JSON.stringify(aoid)}`,
        });
      }

      const id = node.getAttribute('id');
      if (id) {
        spec.biblio.add({
          type: 'op',
          aoid,
          id,
          signature: null,
          effects: [],
        });
      } else {
        const clause = clauseStack[clauseStack.length - 1];
        const clauseId = clause ? clause.id : ''; // TODO: no eqns outside of clauses, eh?
        spec.biblio.add({
          type: 'op',
          aoid,
          refId: clauseId,
          signature: null,
          effects: [],
        });
      }
    }

    let contents;
    try {
      contents = emd.fragment(node.innerHTML);
    } catch (e) {
      utils.warnEmdFailure(spec.warn, node, e as SyntaxError & { line?: number; column?: number });
      node.innerHTML = utils.wrapEmdFailure(node.innerHTML);
      return;
    }

    if (utils.shouldInline(node)) {
      const classString = node.getAttribute('class');
      let classes: string[];

      if (classString) {
        classes = classString.split(' ');
      } else {
        classes = [];
      }

      if (classes.indexOf('inline') === -1) {
        node.setAttribute('class', classes.concat(['inline']).join(' '));
      }
    } else {
      contents =
        '<div>' +
        contents
          .split(/\r?\n/g)
          .filter(s => s.trim().length > 0)
          .join('</div><div>') +
        '</div>';
    }

    node.innerHTML = contents;
  }

  static elements = ['EMU-EQN'];
}
