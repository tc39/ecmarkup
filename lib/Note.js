'use strict';
const Builder = require('./Builder');

module.exports = class Note extends Builder {
  constructor(spec, node, clause) {
    super(spec, node);
    this.clause = clause;
    if (this.node.hasAttribute('id')) {
      this.id = node.getAttribute('id');
    }
  }

  build(number) {
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
};
