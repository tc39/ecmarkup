import jsdom = require('jsdom');
import Promise = require('bluebird');
import chalk = require('chalk');
import Spec = require("./Spec");
import Clause = require("./Clause");

/*@internal*/
export const CLAUSE_ELEMS = ['EMU-INTRO', 'EMU-CLAUSE', 'EMU-ANNEX'];

/*@internal*/
export function htmlToDoc(html: string) {
  return new Promise<HTMLDocument>((res, rej) => {
    jsdom.env(html, (err, window) => {
      if (err) return rej(err);
      res(window.document);
    });
  });
}

/*@internal*/
export function domWalk(root: Node, cb: (node: Element) => boolean | undefined) {
  const childNodes = root.childNodes;
  const childLen = childNodes.length;

  for (let i = 0; i < childLen; i++) {
    const node = childNodes[i];
    if (node.nodeType !== 1) continue;

    const cont = cb(node as Element);
    if (cont === false) continue;

    domWalk(node, cb);
  }
}

/*@internal*/
export function domWalkBackward(root: Node, cb: (node: Element) => boolean | undefined) {
  const childNodes = root.childNodes;
  const childLen = childNodes.length;

  for (let i = childLen - 1; i >= 0; i--) {
    const node = childNodes[i];
    if (node.nodeType !== 1) continue;

    const cont = cb(node as Element);
    if (cont === false) continue;

    domWalkBackward(node, cb);
  }
}

/*@internal*/
export function nodesInClause(clause: Node, nodeTypes: string[]) {
  const results: Element[] = [];
  domWalk(clause, function (childNode) {
    if (CLAUSE_ELEMS.indexOf(childNode.nodeName) > -1) {
      return false;
    }

    if (nodeTypes.indexOf(childNode.nodeName) > -1) {
      results.push(childNode);
    }
  });

  return results;
}

/*@internal*/
export function textNodesUnder(skipList: string[]) {
  return function find(node: Node) {
    let all: Text[] = [];

    for (node = node.firstChild; node; node = node.nextSibling) {
      if (node.nodeType == 3) all.push(node as Text);
      else if (skipList.indexOf(node.nodeName) === -1) all = all.concat(find(node));
    }

    return all;
  };
}

/*@internal*/
export function replaceTextNode(node: Node, documentFragment: DocumentFragment) {
  // Append all the nodes
  const parent = node.parentNode;
  while (documentFragment.childNodes.length > 0) {
    node.parentNode.insertBefore(documentFragment.childNodes[0], node);
  }

  node.parentNode.removeChild(node);
}

/*@internal*/
export function parent(node: Node, types: string[]): Node | null {
  if (node === null) return null;
  if (types.indexOf(node.nodeName) > -1) return node;
  return parent(node.parentElement, types);
}

/*@internal*/
export function getNamespace(spec: Spec, node: Node) {
  const parentClause = getParentClause(node);
  if (parentClause) {
    return parentClause.namespace;
  } else {
    return spec.namespace;
  }
}

/*@internal*/
export function logVerbose(str: string) {
  let dateString = (new Date()).toISOString();
  console.log(chalk.gray('[' + dateString + '] ') + str);
}

/*@internal*/
export function logWarning(str: string) {
  let dateString = (new Date()).toISOString();
  console.log(chalk.gray('[' + dateString + '] ') + chalk.red('Warning: ' + str));
}

/*@internal*/
export function shouldInline(node: Node) {
  let parent = node.parentNode;

  while (parent.nodeName === 'EMU-GRAMMAR' || parent.nodeName === 'EMU-IMPORT' || parent.nodeName === 'INS' || parent.nodeName === 'DEL') {
    parent = parent.parentNode;
  }

  return ['EMU-ANNEX', 'EMU-CLAUSE', 'EMU-INTRO', 'EMU-NOTE', 'BODY'].indexOf(parent.nodeName) === -1;
}

/*@internal*/
export function getParentClauseNode(node: Node) {
  let current = node.parentNode;
  while (current) {
    if (CLAUSE_ELEMS.indexOf(current.nodeName) > -1) return current as Clause.ClauseElement;
    current = current.parentNode;
  }

  return null;
}

/*@internal*/
export function getParentClause(node: Node) {
  let parentClauseNode = getParentClauseNode(node);
  if (parentClauseNode) {
    return parentClauseNode._clause;
  }

  return null;
}

/*@internal*/
export function getParentClauseId(node: Node) {
  let parentClause = getParentClause(node);

  if (!parentClause) {
    return null;
  }

  return parentClause.id;
}
