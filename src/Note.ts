import Builder = require('./Builder');
import Spec = require("./Spec");
import Clause = require("./Clause");

/*@internal*/
class Note extends Builder {
  clause: Clause;
  id: string;
  constructor(spec: Spec, node: HTMLElement, clause: Clause) {
    super(spec, node);
    this.clause = clause;
    if (this.node.hasAttribute('id')) {
      this.id = node.getAttribute('id')!;
    }
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

/*@internal*/
export = Note;