import Note = require('./Note');
import Example = require('./Example');
import emd = require('ecmarkdown');
import utils = require('./utils');
import Builder = require('./Builder');
import Spec = require("./Spec");
import Biblio = require("./Biblio");

/*@internal*/
class Clause extends Builder {
  id: string;
  namespace: string;
  header: HTMLHeadingElement;
  parentClause: Clause | null;
  title: string;
  subclauses: Clause[];
  depth: number;
  number: string;
  aoid: string | null;
  notes: Note[];
  examples: Example[];

  constructor(spec: Spec, node: HTMLElement) {
    super(spec, node);
    (<Clause.ClauseElement>node)._clause = this;

    this.header = node.querySelector('h1');
    if (!this.header) {
      throw new Error('Clause doesn\'t have header: ' + node.outerHTML);
    }

    this.parentClause = utils.getParentClause(node);
    this.title = this.header.textContent!;
    this.subclauses = [];
    this.id = node.id;

    let parentNamespace: string | undefined;
    if (this.parentClause) {
      parentNamespace = this.parentClause.namespace;
      this.depth = this.parentClause.depth + 1;
      this.parentClause.subclauses.push(this);
    } else {
      parentNamespace = this.spec.namespace;
      this.depth = 0;
      this.spec.subclauses.push(this);
    }

    if (node.nodeName === 'EMU-INTRO') {
      this.number = '';
    } else {
      this.number = spec.getNextClauseNumber(this.depth,
        node.nodeName === 'EMU-ANNEX'
        );
    }

    this.aoid = node.getAttribute('aoid');
    if (node.hasAttribute('aoid') && !this.aoid) {
      this.aoid = this.id;
    }

    if (node.hasAttribute('namespace')) {
      this.namespace = node.getAttribute('namespace')!;
      this.spec.biblio.createNamespace(this.namespace, parentNamespace);
    } else {
      this.namespace = parentNamespace;
    }

    // clauses are always at the spec-level namespace.
    this.spec.biblio.add(<Biblio.ClauseBiblioEntry>{
      type: 'clause',
      id: this.id,
      aoid: this.aoid,
      title: this.title,
      number: this.number
    }, this.spec.namespace);

    const record = this.getNotesAndExamples();
    this.notes = record[0];
    this.examples = record[1];
  }

  build() {
    const numElem = this.spec.doc.createElement('span');
    numElem.setAttribute('class', 'secnum');
    numElem.textContent = this.number;
    this.header.insertBefore(numElem, this.header.firstChild);

    this.header.appendChild(this.buildUtils());
    processEmd(this);
    this.buildNotes();
    this.buildExamples();
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

  getNotesAndExamples(): [Note[], Example[]] {
    const notes: Note[] = [];
    const examples: Example[] = [];

    utils.domWalk(this.node, child => {
      if (utils.CLAUSE_ELEMS.indexOf(child.nodeName) > -1) {
        return false;
      }

      if (child.nodeName === 'EMU-NOTE') {
        notes.push(new Note(this.spec, <HTMLElement>child, this));
      }

      if (child.nodeName === 'EMU-EXAMPLE') {
        examples.push(new Example(this.spec, <HTMLElement>child, this));
      }
    });

    return [notes, examples];
  }

  buildUtils() {
    const utilsElem = this.spec.doc.createElement('span');
    utilsElem.setAttribute('class', 'utils');

    const anchorElem = this.spec.doc.createElement('span');
    anchorElem.setAttribute('class', 'anchor');
    anchorElem.innerHTML = '<a href="#' + this.id + '">#</a>';

    utilsElem.appendChild(anchorElem);

    return utilsElem;
  }
}

/*@internal*/
namespace Clause {
  export interface ClauseElement extends HTMLElement {
    _clause: Clause;
  }
}

const NO_EMD = ['PRE', 'CODE', 'EMU-CLAUSE', 'EMU-PRODUCTION', 'EMU-ALG', 'EMU-GRAMMAR', 'EMU-EQN'];
const textNodesUnder = utils.textNodesUnder(NO_EMD);
function processEmd(clause: Clause) {
  const doc = clause.spec.doc;
  const textNodes = textNodesUnder(clause.node);
  for (let j = 0; j < textNodes.length; j++) {
    const node = textNodes[j];
    if (node.textContent!.trim().length === 0) continue;

    // emd strips starting and ending spaces which we want to preserve
    const startSpace = node.textContent!.match(/^\s*/)![0];
    const endSpace = node.textContent!.match(/\s*$/)![0];

    const template = doc.createElement('template');
    template.innerHTML = startSpace + emd.fragment(node.textContent!) + endSpace;

    utils.replaceTextNode(node, template.content);
  }
}

/*@internal*/
export = Clause;