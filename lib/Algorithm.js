'use strict';

module.exports = Algorithm;

var emd = require('ecmarkdown');

function Algorithm(spec, algNode) {
  this.spec = spec;
  this.node = algNode;
}

Algorithm.prototype.build = function () {
  var contents = this.node.innerHTML;
  var html = emd.document(contents);

  html = html.replace(/([A-Z]\w+)\(/g, function (match, name) {
    var op = this.spec.biblio.ops[name];
    if (!op) op = this.spec.externalBiblio.ops[name];
    if (!op) return match;

    return '<a href="' + op.location + '#' + op.id + '">' + name + '</a>(';
  }.bind(this));

  this.node.innerHTML = html;
};
