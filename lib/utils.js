'use strict';

var jsdom = require('jsdom');
var Promise = require('bluebird');

exports.htmlToDoc = function (html) {
  return new Promise(function (res, rej) {
    jsdom.env(html, function (err, window) {
      if (err) return rej(err);
      res(window.document);
    });
  });
};

exports.domWalk = function (root, cb) {
  var childNodes = root.childNodes;
  var childLen = childNodes.length;

  for (var i = 0; i < childLen; i++) {
    var node = childNodes[i];
    if (node.nodeType !== 1) continue;

    var cont = cb(node);
    if (cont === false) continue;

    exports.domWalk(node, cb);
  }
};

exports.textNodesUnder = function (skipList) {
  return function find(node) {
    var all = [];

    for (node = node.firstChild; node; node = node.nextSibling) {
      if (node.nodeType == 3) all.push(node);
      else if (skipList.indexOf(node.nodeName) === -1) all = all.concat(find(node));
    }

    return all;
  };
};

exports.replaceTextNode = function (node, template) {
  // Append all the nodes
  var parent = node.parentNode;
  while (template.childNodes.length > 0) {
    node.parentNode.insertBefore(template.childNodes[0], node);
  }

  node.parentNode.removeChild(node);
};
