module.exports = Note;

function Note(spec, algNode) {
  this.spec = spec;
  this.node = algNode;
}

Note.prototype.build = function() {
  var noteSpan = this.spec.doc.createElement('span');
  noteSpan.setAttribute('class', 'note');
  noteSpan.textContent = 'Note';
  this.node.insertBefore(noteSpan, this.node.firstChild);
}
