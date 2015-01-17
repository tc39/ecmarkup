module.exports = GrammarAnnotation;

function GrammarAnnotation(spec, prod, node) {
  this.spec = spec;
  this.production = prod;
  this.node = node;
}

GrammarAnnotation.prototype.build = function() {
  if(this.node.firstChild.nodeType === 3) {
      this.node.firstChild.textContent = '[' + this.node.firstChild.textContent;
  } else {
      var pre = this.spec.doc.createTextNode('[');
      this.node.insertBefore(pre, this.node.children[0]);
  }

  var post = this.spec.doc.createTextNode(']');
  this.node.appendChild(post);
};
