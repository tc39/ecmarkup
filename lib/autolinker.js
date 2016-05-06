'use strict';
const escape = require('html-escape');
const utils = require('./utils');
const NO_CLAUSE_AUTOLINK = [
  'PRE',
  'CODE',
  'EMU-CLAUSE',
  'EMU-PRODUCTION',
  'EMU-GRAMMAR',
  'EMU-XREF',
  'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
  'EMU-EQN',
  'EMU-ALG',
  'EMU-VAR',
  'EMU-VAL',
  'VAR',
  'A'
];

const clauseTextNodesUnder = utils.textNodesUnder(NO_CLAUSE_AUTOLINK);

exports.link = function(spec) {
  linkClause(spec, spec, new Map());
};

function linkClause(spec, clause, replacerCache) {
  let autolinkmap, clauseReplacer;

  let entry = replacerCache.get(clause.namespace);
  if (entry) {
    autolinkmap = entry[0];
    clauseReplacer = entry[1];
  } else {
    autolinkmap = {};

    spec.biblio.inScopeByType(clause.namespace, 'term')
      .forEach(entry => autolinkmap[entry.key.toLowerCase()] = entry);

    spec.biblio.inScopeByType(clause.namespace, 'op')
      .forEach(entry => autolinkmap[entry.key.toLowerCase()] = entry);

    clauseReplacer = new RegExp(Object.keys(autolinkmap)
      .sort(function (a, b) { return b.length - a.length; })
      .map(function (k) {
        const entry = autolinkmap[k];
        const key = entry.key;

        if (entry.type === 'term') {
          if (isCommonTerm(key)) {
            return '\\b' + key + '\\b(?!\\.\\w|%%|\\]\\])';
          } else if (key[0].match(/[A-Za-z0-9]/)) {
            return '\\b' + caseInsensitiveRegExp(key) + '\\b(?!\\.\\w|%%|\\]\\])';
          } else {
            return key;
          }
        } else {
          // type is "op"
          if (isCommonAbstractOp(key)) {
            return '\\b' + key + '\\b(?=\\()';
          } else {
            return '\\b' + key + '\\b(?!\\.\\w|%%|\\]\\])';
          }
        }
      })
      .join('|'), 'g');
    replacerCache.set(clause.namespace, [autolinkmap, clauseReplacer]);
  }

  autolink(clauseReplacer, autolinkmap, spec, clause.node, clause.id);
  clause.subclauses.forEach(subclause => {
    linkClause(spec, subclause, replacerCache);
  });

  let algs = utils.nodesInClause(clause.node, ['EMU-ALG', 'EMU-EQN']);
  for (let i = 0; i < algs.length; i++) {
    autolink(clauseReplacer, autolinkmap, spec, algs[i], clause.node.id, true);
  }
}

function autolink(replacer, autolinkmap, spec, node, parentId, allowSameId) {
  const textNodes = clauseTextNodesUnder(node);
  for (let i = 0; i < textNodes.length; i++) {
    const node = textNodes[i];

    const template = spec.doc.createElement('template');
    const content = escape(node.textContent);
    const autolinked = content.replace(replacer, match => {
      const entry = autolinkmap[match.toLowerCase()];
      const entryId = entry.id || entry.refId;
      if (!entry || (entryId === parentId && !allowSameId)) {
        return match;
      }

      if (entry.aoid) {
        return '<emu-xref aoid="' + entry.aoid + '">' + match + '</emu-xref>';
      } else {
        return '<emu-xref href="#' + (entry.id || entry.refId) + '">' + match + '</emu-xref>';
      }
    });

    if (autolinked !== content) {
      template.innerHTML = autolinked;
      utils.replaceTextNode(node, template.content);
    }
  }
}

function isCommonAbstractOp(op) {
  return op === 'Call' || op === 'Set' || op === 'Type' || op === 'UTC' || op === 'min' || op === 'max';
}

function isCommonTerm(op) {
  return op === 'List' || op === 'Reference' || op === 'Record';
}

function caseInsensitiveRegExp(str) {
  let lower = str[0].toLowerCase();

  if (lower !== str[0]) return str;

  let upper = lower.toUpperCase();
  if (lower === upper) {
    return str;
  }

  return `[${lower}${upper}]${str.slice(1)}`;
}
