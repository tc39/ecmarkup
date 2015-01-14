var jsdom = require('jsdom');
var Promise = require('bluebird');

exports.htmlToDoc = function (html) {
  return new Promise(function(res, rej) {
    jsdom.env(html, function(err, window) {
      if(err) return rej(err);
      res(window.document);
    });
  });
}

exports.domWalk = function(root, cb) {
  var childNodes = root.childNodes;
  var childLen = childNodes.length;

  for(var i = 0; i < childLen; i++) {
    var node = childNodes[i];
    if(node.nodeType !== 1) continue;

    var cont = cb(node);
    if(cont === false) continue;

    exports.domWalk(node, cb);
  }
}
