module.exports = RHS;

function RHS(spec, prod, node) {
  this.spec = spec;
  this.production = prod;
  this.node = node;
  this.constraints = node.getAttribute('constraints');
  this.alternativeId = node.getAttribute('a');
}

RHS.prototype.build = function() {
  if(this.node.textContent === '') {
      this.node.textContent = '[empty]';

      return;
  }

  if(this.constraints) {
      var cs = this.spec.doc.createElement('emu-constraints');
      cs.textContent = '[' + this.constraints + ']';

      this.node.insertBefore(cs, this.node.childNodes[0]);
  }

  this.terminalify(this.node);
};

RHS.prototype.terminalify = function(parentNode) {
    for(var i = 0; i < parentNode.childNodes.length; i++) {
        var node = parentNode.childNodes[i];

        if(node.nodeType === 3) {
            var text = node.textContent.trim();
            var pieces = text.split(/\s/);

            pieces.forEach(function(p) {
                if(p.length === 0) {
                    return;
                }
                var est = this.spec.doc.createElement('emu-t');
                est.textContent = p;

                parentNode.insertBefore(est, node);
            }, this);

            parentNode.removeChild(node);
        }
    }
};
