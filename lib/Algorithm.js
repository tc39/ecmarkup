module.exports = Algorithm;

var emd = require('ecmarkdown');

function Algorithm(spec, algNode) {
  this.spec = spec;
  this.node = algNode;
  var aoid = this.node.getAttribute('aoid');
  if(aoid) {
    this.node.id = 'ao-' + aoid;
    this.spec.biblio.ops[aoid] = '#' + this.node.id;
  }
}

Algorithm.prototype.build = function() {
  var contents = this.node.innerHTML;
  var baseIndent = contents.match(/^([ \t]*)[\w\d]/m)[1];
  var baseIndentRe = new RegExp("^" + baseIndent, "gm");
  var html = emd.list(contents.replace(baseIndentRe, ""));
  html = html.replace(/([A-Z]\w+)\(/g, function(match, name) {
    var op = this.spec.biblio.ops[name];
    if(!op) op = this.spec.externalBiblio.ops[name];
    if(!op) return match;

    return '<a href="' + op + '">' + name + '</a>(';
  }.bind(this));

  this.node.innerHTML = html;
};
