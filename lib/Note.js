'use strict';
const Builder = require('./Builder');

module.exports = class Note extends Builder {
  build(number) {
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
