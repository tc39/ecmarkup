import Builder from './Builder';
import emd = require('ecmarkdown');
import utils = require('./utils');
import Spec from './Spec';
import Biblio, { AlgorithmBiblioEntry } from './Biblio';
import { Context } from './Context';

/*@internal*/
export default class Eqn extends Builder {
  aoid: string | null;
  clauseId: string | null;

  constructor(spec: Spec, node: HTMLElement, clauseId: string) {
    super(spec, node);
    this.aoid = node.getAttribute('aoid');
    this.clauseId = clauseId;

    if (this.aoid) {
      this.spec.biblio.add(<AlgorithmBiblioEntry>{
        type: 'op',
        aoid: this.aoid,
        refId: this.clauseId
      });
    }
  }

  static enter(context: Context) {
    const { spec, node, clauseStack } = context;
    const clause = clauseStack[clauseStack.length - 1];
    const id = clause ? clause.id : ''; // TODO: no eqns outside of clauses, eh?
    const eqn = new Eqn(spec, node, id);
    let contents = emd.document(node.innerHTML).slice(3, -4);

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
      contents = '<div>' + contents.split(/\r?\n/g)
                                   .filter(s => s.trim().length > 0)
                                   .join('</div><div>') + '</div>';
    }

    node.innerHTML = contents;
    context.inAlg = true;
  }

  static exit(context: Context) {
    context.inAlg = false;
  }

  static elements = ['EMU-EQN'];
}