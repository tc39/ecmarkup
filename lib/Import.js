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
      var nodes = importDoc.body.childNodes;
      var parent = this.node.parentNode;
      var frag = this.spec.doc.createDocumentFragment();

      for(var i = 0; i < nodes.length; i++) {
        var node = nodes[i];
        var importedNode = this.spec.doc.importNode(node, true);
        frag.appendChild(importedNode);
      }

      var imports = Array.prototype.slice.call(frag.querySelectorAll('link[rel=import]'));

      parent.insertBefore(frag, this.node);
      parent.removeChild(this.node);

      if(imports.length === 0) return;

      return this.spec.inlineImports(imports, Path.dirname(importPath));
    }.bind(this));
};
