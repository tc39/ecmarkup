'use strict';

const jsdom = require('jsdom');
const Promise = require('bluebird');
const chalk = require('chalk');
const CLAUSE_ELEMS = ['EMU-INTRO', 'EMU-CLAUSE', 'EMU-ANNEX'];

exports.htmlToDoc = html => {
  return new Promise((res, rej) => {
    jsdom.env(html, (err, window) => {
      if (err) return rej(err);
      res(window.document);
    });
  });
};

exports.domWalk = (root, cb) => {
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

exports.domWalkBackward = (root, cb) => {
  const childNodes = root.childNodes;
  const childLen = childNodes.length;

  for (let i = childLen - 1; i >= 0; i--) {
    const node = childNodes[i];
    if (node.nodeType !== 1) continue;

    const cont = cb(node);
    if (cont === false) continue;

    exports.domWalkBackward(node, cb);
  }
};

exports.nodesInClause = (clause, nodeTypes) => {
  const results = [];
  exports.domWalk(clause, function (childNode) {
    if (CLAUSE_ELEMS.indexOf(childNode.nodeName) > -1) {
      return false;
    }

    if (nodeTypes.indexOf(childNode.nodeName) > -1) {
      results.push(childNode);
    }
  });

  return results;
};

exports.textNodesUnder = skipList => {
  return function find(node) {
    let all = [];

    for (node = node.firstChild; node; node = node.nextSibling) {
      if (node.nodeType == 3) all.push(node);
      else if (skipList.indexOf(node.nodeName) === -1) all = all.concat(find(node));
    }

    return all;
  };
};

exports.replaceTextNode = (node, template) => {
  // Append all the nodes
  const parent = node.parentNode;
  while (template.childNodes.length > 0) {
    node.parentNode.insertBefore(template.childNodes[0], node);
  }

  node.parentNode.removeChild(node);
};

exports.parent = (node, types) => {
  if (node === null) return null;
  if (types.indexOf(node.nodeName) > -1) return node;
  return exports.parent(node.parentNode, types);
};

exports.getNamespace = (spec, node) => {
  const parentClause = exports.getParentClause(node);
  if (parentClause) {
    return parentClause.namespace;
  } else {
    return spec.namespace;
  }
};


exports.logVerbose = str => {
  let dateString = (new Date()).toISOString();
  console.log(chalk.gray('[' + dateString + '] ') + str);
};

exports.logWarning = str => {
  let dateString = (new Date()).toISOString();
  console.log(chalk.gray('[' + dateString + '] ') + chalk.red('Warning: ' + str));
};

exports.shouldInline = node => {
  let parent = node.parentNode;

  while (parent.nodeName === 'EMU-GRAMMAR' || parent.nodeName === 'EMU-IMPORT' || parent.nodeName === 'INS' || parent.nodeName === 'DEL') {
    parent = parent.parentNode;
  }

  return ['EMU-ANNEX', 'EMU-CLAUSE', 'EMU-INTRO', 'EMU-NOTE', 'BODY'].indexOf(parent.nodeName) === -1;
};

exports.getParentClauseNode = node => {
  let current = node.parentNode;
  while (current) {
    if (CLAUSE_ELEMS.indexOf(current.nodeName) > -1) return current;
    current = current.parentNode;
  }

  return null;
};

exports.getParentClause = node => {
  let parentClauseNode = exports.getParentClauseNode(node);
  if (parentClauseNode) {
    return parentClauseNode._clause;
  }

  return null;
};

exports.getParentClauseId = node => {
  let parentClause = exports.getParentClause(node);

  if (!parentClause) {
    return null;
  }

  return parentClause.id;
};

exports.CLAUSE_ELEMS = CLAUSE_ELEMS;
