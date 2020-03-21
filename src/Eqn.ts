import Builder from './Builder';
import * as emd from 'ecmarkdown';
import * as utils from './utils';
import type Spec from './Spec';
import type { AlgorithmBiblioEntry } from './Biblio';
import type { Context } from './Context';

/*@internal*/
export default class Eqn extends Builder {
  aoid: string | null;
  clauseId: string | null;
  id: string | null;

  constructor(spec: Spec, node: HTMLElement, clauseId: string) {
    super(spec, node);
    this.aoid = node.getAttribute('aoid');
    this.clauseId = clauseId;
    this.id = node.getAttribute('id');

    if (this.aoid) {
      if (this.id) {
        this.spec.biblio.add(<AlgorithmBiblioEntry>{
          type: 'op',
          aoid: this.aoid,
          id: this.id,
          referencingIds: []
        });
      } else {
        this.spec.biblio.add(<AlgorithmBiblioEntry>{
          type: 'op',
          aoid: this.aoid,
          refId: this.clauseId,
          referencingIds: []
        });
      }
    }
  }

  static enter(context: Context) {
    const { spec, node, clauseStack } = context;
    const clause = clauseStack[clauseStack.length - 1];
    const id = clause ? clause.id : ''; // TODO: no eqns outside of clauses, eh?
    const eqn = new Eqn(spec, node, id); // TODO: this variable is unused, but apparently it has side effects. Removing this line removes emu-xrefs
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
  }

  static exit(context: Context) { }

  static elements = ['EMU-EQN'];
}
