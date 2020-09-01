import type Note from './Note';
import type Example from './Example';
import type Spec from './Spec';
import type { ClauseBiblioEntry } from './Biblio';
import type { Context } from './Context';

import Builder from './Builder';

/*@internal*/
export default class Clause extends Builder {
  id: string;
  namespace: string;
  // @ts-ignore skipping the strictPropertyInitialization check
  header: HTMLHeadingElement;
  parentClause: Clause;
  title?: string;
  // @ts-ignore skipping the strictPropertyInitialization check
  titleHTML: string;
  subclauses: Clause[];
  number: string;
  aoid: string | null;
  notes: Note[];
  editorNotes: Note[];
  examples: Example[];

  constructor(spec: Spec, node: HTMLElement, parent: Clause, number: string) {
    super(spec, node);
    this.parentClause = parent;
    this.id = node.getAttribute('id')!;
    this.number = number;
    this.subclauses = [];
    this.notes = [];
    this.editorNotes = [];
    this.examples = [];

    // namespace is either the entire spec or the parent clause's namespace.
    let parentNamespace = spec.namespace;
    if (parent) {
      parentNamespace = parent.namespace;
    }

    if (node.hasAttribute('namespace')) {
      this.namespace = node.getAttribute('namespace')!;
      spec.biblio.createNamespace(this.namespace, parentNamespace);
    } else {
      this.namespace = parentNamespace;
    }

    this.aoid = node.getAttribute('aoid');
    if (this.aoid === '') {
      // <emu-clause id=foo aoid> === <emu-clause id=foo aoid=foo>
      this.aoid = node.id;
    }
  }

  buildHeader() {
    if (!this.number) return;

    const numElem = this.spec.doc.createElement('span');
    numElem.setAttribute('class', 'secnum');
    numElem.textContent = this.number;
    this.header.insertBefore(this.spec.doc.createTextNode(' '), this.header.firstChild);
    this.header.insertBefore(numElem, this.header.firstChild);
  }

  buildNotes() {
    if (this.notes.length === 1) {
      this.notes[0].build();
    } else {
      // pass along note index
      this.notes.forEach((note, i) => {
        note.build(i + 1);
      });
    }

    this.editorNotes.forEach(note => note.build());
  }

  buildExamples() {
    if (this.examples.length === 1) {
      this.examples[0].build();
    } else {
      // pass along example index
      this.examples.forEach((example, i) => {
        example.build(i + 1);
      });
    }
  }

  buildUtils() {
    const utilsElem = this.spec.doc.createElement('span');
    utilsElem.setAttribute('class', 'utils');

    const anchorElem = this.spec.doc.createElement('span');
    anchorElem.setAttribute('class', 'anchor');
    anchorElem.innerHTML = '<a href="#' + this.id + '">link</a>';

    const pinElem = this.spec.doc.createElement('span');
    pinElem.setAttribute('class', 'anchor');
    pinElem.innerHTML = '<a href="#" class="utils-pin">pin</a>';

    utilsElem.appendChild(anchorElem);
    utilsElem.appendChild(pinElem);

    this.header.appendChild(utilsElem);
  }

  static enter({ spec, node, clauseStack, clauseNumberer }: Context) {
    if (!node.id) {
      spec.warn({
        type: 'node',
        ruleId: 'missing-id',
        message: "clause doesn't have an id",
        node,
      });
    }

    let nextNumber = '';
    if (node.nodeName !== 'EMU-INTRO') {
      nextNumber = clauseNumberer.next(clauseStack.length, node.nodeName === 'EMU-ANNEX').value;
    }
    const parent = clauseStack[clauseStack.length - 1] || null;

    const clause = new Clause(spec, node, parent, nextNumber);

    if (parent) {
      parent.subclauses.push(clause);
    } else {
      spec.subclauses.push(clause);
    }

    clauseStack.push(clause);
  }

  static exit({ spec, clauseStack }: Context) {
    const clause = clauseStack[clauseStack.length - 1];

    if (!clause.header) {
      // TODO make this not a hard failure
      throw new Error("Couldn't find title for clause #" + clause.id);
    }

    clause.title = clause.header.textContent!;
    clause.titleHTML = clause.header.innerHTML;
    clause.buildHeader();
    clause.buildExamples();
    clause.buildNotes();
    //clause.buildUtils();

    // clauses are always at the spec-level namespace.
    spec.biblio.add(
      <ClauseBiblioEntry>{
        type: 'clause',
        id: clause.id,
        aoid: clause.aoid,
        title: clause.title,
        titleHTML: clause.titleHTML,
        number: clause.number,
      },
      spec.namespace
    );

    clauseStack.pop();
  }

  static elements = ['EMU-INTRO', 'EMU-CLAUSE', 'EMU-ANNEX'];
  static linkElements = Clause.elements;
}
