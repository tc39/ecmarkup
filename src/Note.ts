import type Spec from './Spec';
import type Clause from './Clause';
import type { Context } from './Context';

import { getLocation } from './lint/utils';
import Builder from './Builder';

/*@internal*/
export default class Note extends Builder {
  clause: Clause;
  id?: string;
  type: string; // normal, editor
  static elements = ['EMU-NOTE'];

  constructor(spec: Spec, node: HTMLElement, clause: Clause) {
    super(spec, node);
    this.clause = clause;
    if (this.node.hasAttribute('type')) {
      this.type = this.node.getAttribute('type') as string;
    } else {
      this.type = 'normal';
    }

    if (this.node.hasAttribute('id')) {
      this.id = node.getAttribute('id')!;
    }
  }

  static enter({ spec, node, clauseStack }: Context) {
    const clause = clauseStack[clauseStack.length - 1];
    if (!clause) return; // do nothing with top-level note

    const note = new Note(spec, node, clause);
    if (note.type === 'editor') {
      clause.editorNotes.push(note);
    } else {
      clause.notes.push(note);
    }
  }

  build(number?: number) {
    if (this.id) {
      // biblio is added during the build step as we don't know
      // the number at build time. Could probably be fixed.
      this.spec.biblio.add({
        type: 'note',
        id: this.id,
        node: this.node,
        number: number || 1,
        clauseId: this.clause.id,
        referencingIds: [],
      });
    }

    const noteContentContainer = this.spec.doc.createElement('div');
    noteContentContainer.setAttribute('class', 'note-contents');

    while (this.node.childNodes.length > 0) {
      noteContentContainer.appendChild(this.node.childNodes[0]);
    }

    this.node.appendChild(noteContentContainer);

    const noteSpan = this.spec.doc.createElement('span');
    noteSpan.setAttribute('class', 'note');
    let label = '';

    if (this.type === 'normal') {
      label = 'Note';
    } else if (this.type === 'editor') {
      label = "Editor's Note";
    } else {
      let nodeLoc = getLocation(this.spec.dom, this.node);
      this.spec.warn({
        ruleId: 'invalid-note',
        nodeType: 'emu-note',
        message: `unknown note type ${this.type}`,
        line: nodeLoc.startTag.line,
        column: nodeLoc.startTag.col,
      });
    }

    if (number !== undefined) {
      label += ' ' + number;
    }

    if (this.id) {
      // create link to note
      noteSpan.innerHTML = `<a href='#${this.id}'>${label}</a>`;
    } else {
      // just text
      noteSpan.textContent = label;
    }

    this.node.insertBefore(noteSpan, noteContentContainer);
  }
}
