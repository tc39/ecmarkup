"use strict";
const jsdom = require('jsdom');
const Promise = require('bluebird');
const chalk = require('chalk');
/*@internal*/
exports.CLAUSE_ELEMS = ['EMU-INTRO', 'EMU-CLAUSE', 'EMU-ANNEX'];
/*@internal*/
function htmlToDoc(html) {
    return new Promise((res, rej) => {
        jsdom.env(html, (err, window) => {
            if (err)
                return rej(err);
            res(window.document);
        });
    });
}
exports.htmlToDoc = htmlToDoc;
/*@internal*/
function domWalk(root, cb) {
    const childNodes = root.childNodes;
    const childLen = childNodes.length;
    for (let i = 0; i < childLen; i++) {
        const node = childNodes[i];
        if (node.nodeType !== 1)
            continue;
        const cont = cb(node);
        if (cont === false)
            continue;
        domWalk(node, cb);
    }
}
exports.domWalk = domWalk;
/*@internal*/
function domWalkBackward(root, cb) {
    const childNodes = root.childNodes;
    const childLen = childNodes.length;
    for (let i = childLen - 1; i >= 0; i--) {
        const node = childNodes[i];
        if (node.nodeType !== 1)
            continue;
        const cont = cb(node);
        if (cont === false)
            continue;
        domWalkBackward(node, cb);
    }
}
exports.domWalkBackward = domWalkBackward;
/*@internal*/
function nodesInClause(clause, nodeTypes) {
    const results = [];
    domWalk(clause, function (childNode) {
        if (exports.CLAUSE_ELEMS.indexOf(childNode.nodeName) > -1) {
            return false;
        }
        if (nodeTypes.indexOf(childNode.nodeName) > -1) {
            results.push(childNode);
        }
    });
    return results;
}
exports.nodesInClause = nodesInClause;
/*@internal*/
function textNodesUnder(skipList) {
    return function find(node) {
        let all = [];
        for (node = node.firstChild; node; node = node.nextSibling) {
            if (node.nodeType == 3)
                all.push(node);
            else if (skipList.indexOf(node.nodeName) === -1)
                all = all.concat(find(node));
        }
        return all;
    };
}
exports.textNodesUnder = textNodesUnder;
/*@internal*/
function replaceTextNode(node, documentFragment) {
    // Append all the nodes
    const parent = node.parentNode;
    while (documentFragment.childNodes.length > 0) {
        node.parentNode.insertBefore(documentFragment.childNodes[0], node);
    }
    node.parentNode.removeChild(node);
}
exports.replaceTextNode = replaceTextNode;
/*@internal*/
function parent(node, types) {
    if (node === null)
        return null;
    if (types.indexOf(node.nodeName) > -1)
        return node;
    return parent(node.parentElement, types);
}
exports.parent = parent;
/*@internal*/
function getNamespace(spec, node) {
    const parentClause = getParentClause(node);
    if (parentClause) {
        return parentClause.namespace;
    }
    else {
        return spec.namespace;
    }
}
exports.getNamespace = getNamespace;
/*@internal*/
function logVerbose(str) {
    let dateString = (new Date()).toISOString();
    console.log(chalk.gray('[' + dateString + '] ') + str);
}
exports.logVerbose = logVerbose;
/*@internal*/
function logWarning(str) {
    let dateString = (new Date()).toISOString();
    console.log(chalk.gray('[' + dateString + '] ') + chalk.red('Warning: ' + str));
}
exports.logWarning = logWarning;
/*@internal*/
function shouldInline(node) {
    let parent = node.parentNode;
    while (parent.nodeName === 'EMU-GRAMMAR' || parent.nodeName === 'EMU-IMPORT' || parent.nodeName === 'INS' || parent.nodeName === 'DEL') {
        parent = parent.parentNode;
    }
    return ['EMU-ANNEX', 'EMU-CLAUSE', 'EMU-INTRO', 'EMU-NOTE', 'BODY'].indexOf(parent.nodeName) === -1;
}
exports.shouldInline = shouldInline;
/*@internal*/
function getParentClauseNode(node) {
    let current = node.parentNode;
    while (current) {
        if (exports.CLAUSE_ELEMS.indexOf(current.nodeName) > -1)
            return current;
        current = current.parentNode;
    }
    return null;
}
exports.getParentClauseNode = getParentClauseNode;
/*@internal*/
function getParentClause(node) {
    let parentClauseNode = getParentClauseNode(node);
    if (parentClauseNode) {
        return parentClauseNode._clause;
    }
    return null;
}
exports.getParentClause = getParentClause;
/*@internal*/
function getParentClauseId(node) {
    let parentClause = getParentClause(node);
    if (!parentClause) {
        return null;
    }
    return parentClause.id;
}
exports.getParentClauseId = getParentClauseId;
//# sourceMappingURL=utils.js.map