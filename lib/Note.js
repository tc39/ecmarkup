'use strict';

module.exports = Note;

function Note(spec, node) {
  this.spec = spec;
  this.node = node;
}

Note.prototype.build = function (number) {
  var noteSpan = this.spec.doc.createElement('span');
  noteSpan.setAttribute('class', 'note');

  if (number !== undefined) {
    noteSpan.textContent = 'Note ' + number;
  } else {
    noteSpan.textContent = 'Note';
  }

  this.node.insertBefore(noteSpan, this.node.firstChild);
};
