import Builder from './Builder';
import Spec from './Spec';
import Clause from './Clause';
import { Context } from './Context';

/*@internal*/
export default class Note extends Builder {
  clause: Clause;
  id: string;

  static elements = ['EMU-NOTE'];

  constructor(spec: Spec, node: HTMLElement, clause: Clause) {
    super(spec, node);
    this.clause = clause;
    if (this.node.hasAttribute('id')) {
      this.id = node.getAttribute('id')!;
    }
  }

  static enter({spec, node, clauseStack}: Context) {
    const clause = clauseStack[clauseStack.length - 1];
    if (!clause) return; // do nothing with top-level note

    clause.notes.push(new Note(spec, node, clause));
  }

  build(number?: number) {
    if (this.id) {
      // biblio is added during the build step as we don't know
      // the number at build time. Could probably be fixed.
      this.spec.biblio.add({
        type: 'note',
        id: this.id,
        number: number || 1,
        clauseId: this.clause.id
      });
    }

    const noteSpan = this.spec.doc.createElement('span');
    noteSpan.setAttribute('class', 'note');

    if (number !== undefined) {
      noteSpan.textContent = 'Note ' + number;
    } else {
      noteSpan.textContent = 'Note';
    }

    this.node.insertBefore(noteSpan, this.node.firstChild);
  }
}