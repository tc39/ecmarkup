module.exports = Import;
var utils = require('./utils');
var Path = require('path');
var Promise = require('bluebird');


function Import(spec, node, rootDir) {
  this.spec = spec;
  this.node = node;
  this.rootDir = rootDir;
}

Import.prototype.inline = function() {
  var href = this.node.getAttribute('href');
  var importPath = Path.join(this.rootDir, href);

  return this.spec.fetch(importPath)
    .then(utils.htmlToDoc)
    .then(function(importDoc) {
      this._importDocBefore(importDoc, this.node);
      var parent = this.node.parentNode;
      parent.removeChild(this.node);

      var imports = Array.prototype.slice.call(parent.querySelectorAll('link[rel=import]'));
      return Promise.all(imports.map(function() {
        return this.spec.inlineImports(imports, Path.dirname(importPath));
      }, this));
    }.bind(this))
}

Import.prototype._importDocBefore = function(importDoc, loc) {
  var nodes = importDoc.body.childNodes;

  for(var i = 0; i < nodes.length; i++) {
    var node = nodes[i];
    var importedNode = this.spec.doc.node(node, true);
    loc.parentNode.insertBefore(importedNode, loc);
  }
}
