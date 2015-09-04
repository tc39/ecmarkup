'use strict';

const CLAUSE_ELEMS = ['EMU-INTRO', 'EMU-CLAUSE', 'EMU-ANNEX'];
const Note = require('./Note');
const Example = require('./Example');
const emd = require('ecmarkdown');
const utils = require('./utils');
const Builder = require('./Builder');

module.exports = class Clause extends Builder {
  constructor(spec, node) {
    super(spec, node);
    node._clause = this;

    this.header = node.querySelector('h1');
    if (!this.header) {
      throw new Error('Clause doesn\'t have header: ' + node.outerHTML);
    }

    this.parentClause = getParentClause(node);
    this.title = this.header.textContent;
    this.subclauses = [];
    this.id = node.id;

    if (this.parentClause) {
      this.depth = this.parentClause.depth + 1;
      this.parentClause.subclauses.push(this);
    } else {
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
    if (this.aoid !== null) {
      if (this.aoid === '') this.aoid = this.id;

      this.spec.biblio.ops[this.aoid] = {
        aoid: this.aoid,
        id: this.id,
        location: '',
      };
    }

    this.spec.biblio.clauses[this.id] = {
      location: '',
      id: this.id,
      aoid: this.aoid,
      title: this.title,
      number: this.number
    };

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
      this.notes.forEach(function (note, i) {
        note.build(i + 1);
      }, this);
    }
  }

  buildExamples() {
    if (this.examples.length === 1) {
      this.examples[0].build();
    } else {
      // pass along example index
      this.examples.forEach(function (example, i) {
        example.build(i + 1);
      }, this);
    }
  }

  getNotesAndExamples() {
    const notes = [];
    const examples = [];

    utils.domWalk(this.node, function (child) {
      if (CLAUSE_ELEMS.indexOf(child.nodeName) > -1) {
        return false;
      }

      if (child.nodeName === 'EMU-NOTE') {
        notes.push(new Note(this.spec, child, this));
      }

      if (child.nodeName === 'EMU-EXAMPLE') {
        examples.push(new Example(this.spec, child, this));
      }
    }.bind(this));

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
};

function getParentClause(node) {
  let current = node.parentNode;
  while (current) {
    if (CLAUSE_ELEMS.indexOf(current.nodeName) > -1) return current._clause;
    current = current.parentNode;
  }

  return null;
}

const NO_EMD = ['PRE', 'CODE', 'EMU-CLAUSE', 'EMU-PRODUCTION', 'EMU-ALG', 'EMU-GRAMMAR', 'EMU-EQN'];
const textNodesUnder = utils.textNodesUnder(NO_EMD);
function processEmd(clause) {
  const doc = clause.spec.doc;
  const textNodes = textNodesUnder(clause.node);
  for (let j = 0; j < textNodes.length; j++) {
    const node = textNodes[j];
    if (node.textContent.trim().length === 0) continue;

    // emd strips starting and ending spaces which we want to preserve
    const startSpace = node.textContent.match(/^\s*/)[0];
    const endSpace = node.textContent.match(/\s*$/)[0];

    const template = doc.createElement('template');
    template.innerHTML = startSpace + emd.fragment(node.textContent) + endSpace;

    utils.replaceTextNode(node, template);
  }
}
