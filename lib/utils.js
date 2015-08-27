'use strict';

const jsdom = require('jsdom');
const Promise = require('bluebird');
const chalk = require('chalk');

exports.htmlToDoc = function (html) {
  return new Promise(function (res, rej) {
    jsdom.env(html, function (err, window) {
      if (err) return rej(err);
      res(window.document);
    });
  });
};

exports.domWalk = function (root, cb) {
  const childNodes = root.childNodes;
  const childLen = childNodes.length;

  for (let i = 0; i < childLen; i++) {
    const node = childNodes[i];
    if (node.nodeType !== 1) continue;

    const cont = cb(node);
    if (cont === false) continue;

    exports.domWalk(node, cb);
  }
};

exports.textNodesUnder = function (skipList) {
  return function find(node) {
    let all = [];

    for (node = node.firstChild; node; node = node.nextSibling) {
      if (node.nodeType == 3) all.push(node);
      else if (skipList.indexOf(node.nodeName) === -1) all = all.concat(find(node));
    }

    return all;
  };
};

exports.replaceTextNode = function (node, template) {
  // Append all the nodes
  const parent = node.parentNode;
  while (template.childNodes.length > 0) {
    node.parentNode.insertBefore(template.childNodes[0], node);
  }

  node.parentNode.removeChild(node);
};

exports.parent = function parent(node, types) {
  if (node === null) return null;
  if (types.indexOf(node.nodeName) > -1) return node;
  return parent(node.parentNode, types);
};


exports.logVerbose = function(str) {
  let dateString = (new Date()).toISOString();
  console.log(chalk.gray('[' + dateString + '] ') + str);
};

exports.logWarning = function(str) {
  let dateString = (new Date()).toISOString();
  console.log(chalk.gray('[' + dateString + '] ') + chalk.red('Warning: ' + str));
};
