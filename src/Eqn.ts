import type { AlgorithmBiblioEntry } from './Biblio';
import type { Context } from './Context';

import Builder from './Builder';
import * as emd from 'ecmarkdown';
import * as utils from './utils';

/*@internal*/
export default class Eqn extends Builder {
  // @ts-ignore
  constructor() {
    throw new Error('not actually constructible');
  }

  static async enter(context: Context) {
    const { spec, node, clauseStack } = context;

    let aoid = node.getAttribute('aoid');
    if (aoid) {
      let id = node.getAttribute('id');
      if (id) {
        spec.biblio.add(<AlgorithmBiblioEntry>{
          type: 'op',
          aoid,
          id,
          referencingIds: [],
        });
      } else {
        const clause = clauseStack[clauseStack.length - 1];
        const clauseId = clause ? clause.id : ''; // TODO: no eqns outside of clauses, eh?
        spec.biblio.add(<AlgorithmBiblioEntry>{
          type: 'op',
          aoid,
          refId: clauseId,
          referencingIds: [],
        });
      }
    }

    let contents;
    try {
      contents = emd.fragment(node.innerHTML);
    } catch (e) {
      utils.warnEmdFailure(spec.warn, node, e);
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
