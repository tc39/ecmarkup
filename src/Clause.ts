import Note from './Note';
import Example from './Example';
import emd = require('ecmarkdown');
import { logWarning, replaceTextNode } from './utils';
import Builder from './Builder';
import Spec from "./Spec";
import Biblio, { ClauseBiblioEntry } from "./Biblio";
import { Context } from './Context';

/*@internal*/
export default class Clause extends Builder {
  id: string;
  namespace: string;
  header: HTMLHeadingElement;
  parentClause: Clause;
  title: string;
  titleHTML: string;
  subclauses: Clause[];
  number: string;
  aoid: string | null;
  notes: Note[];
  examples: Example[];

  constructor(
    spec: Spec,
    node: HTMLElement,
    parent: Clause,
    id: string,
    number: string,
    namespace: string,
    aoid: string | null
  ) {
    super(spec, node);
    this.parentClause = parent;
    this.id = id;
    this.number = number;
    this.subclauses = [];
    this.namespace = namespace;
    this.aoid = aoid;
    this.notes = [];
    this.examples = [];
  }

  buildHeader() {
    const numElem = this.spec.doc.createElement('span');
    numElem.setAttribute('class', 'secnum');
    numElem.textContent = this.number;
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

  static enter({spec, node, clauseStack, clauseNumberer}: Context) {
    if (!node.id) {
      logWarning("Clause doesn't have an id: " + node.outerHTML.slice(0, 100));
    }
    
    let nextNumber = '';
    if (node.nodeName !== 'EMU-INTRO') {
      nextNumber = clauseNumberer.next(clauseStack.length, node.nodeName === 'EMU-ANNEX').value;
    }
    const parent = clauseStack[clauseStack.length - 1] || null;

    let parentNamespace: string;
    if (parent) {
      parentNamespace = parent.namespace;
    } else {
      parentNamespace = spec.namespace;
    }

    let newNamespace = false;
    let namespace: string;
    if (node.hasAttribute('namespace')) {
      namespace = node.getAttribute('namespace')!;
      spec.biblio.createNamespace(namespace, parentNamespace);
    } else {
      namespace = parentNamespace;
    }

    let aoid = node.getAttribute('aoid');
    if (aoid === "") {
      // <emu-clause id=foo aoid> === <emu-clause id=foo aoid=foo>
      aoid = node.id;
    }
    const clause = new Clause(spec, node, parent, node.id, nextNumber, namespace, aoid);
    
    if (parent) {
      parent.subclauses.push(clause);
    } else {
      spec.subclauses.push(clause);
    }

    clauseStack.push(clause);
  }

  static exit({spec, node, clauseStack}: Context) {
    const clause = clauseStack[clauseStack.length - 1];

    if (!clause.header) {
      throw new Error("Couldn't find title for clause #" + clause.id);
    }


    clause.title = clause.header.textContent!;
    clause.titleHTML = clause.header.innerHTML;
    clause.buildHeader();
    clause.buildExamples();
    clause.buildNotes();
    clause.buildUtils();

    // clauses are always at the spec-level namespace.
    spec.biblio.add(<ClauseBiblioEntry>{
      type: 'clause',
      id: clause.id,
      aoid: clause.aoid,
      title: clause.title,
      titleHTML: clause.titleHTML,
      number: clause.number
    }, spec.namespace);

    clauseStack.pop();
  }

  static elements = ['EMU-INTRO', 'EMU-CLAUSE', 'EMU-ANNEX'];
  static linkElements = Clause.elements;
}