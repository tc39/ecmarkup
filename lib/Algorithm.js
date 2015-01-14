module.exports = Algorithm;

var emd = require('ecmarkdown');

function Algorithm(spec, algNode) {
  this.spec = spec;
  this.node = algNode;
  var aaid = this.node.getAttribute('aaid');
  if(aaid) {
    this.node.id = 'aa-' + aaid;
    this.spec.biblio.ops[aaid] = '#' + this.node.id;
  }
}

Algorithm.prototype.build = function() {
  var contents = this.node.textContent;
  var baseIndent = contents.match(/^([ \t]*)[\w\d]/m)[1];
  var baseIndentRe = new RegExp("^" + baseIndent, "gm");
  var html = emd.list(contents.replace(baseIndentRe, ""));
  html = html.replace(/([A-Z]\w+)\(/g, function(_, name) {
    var op = this.spec.biblio.ops[name];
    if(!op) op = this.spec.externalBiblio.ops[name];
    if(!op) return;

    return '<a href="' + op + '">' + name + '</a>('
  }.bind(this));

  this.node.innerHTML = html;
}
