import Spec = require('./Spec');
import Clause = require('./Clause');
import Biblio = require('./Biblio');
import escape = require('html-escape');
import utils = require('./utils');

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
  'A',
  'DFN'
];

const clauseTextNodesUnder = utils.textNodesUnder(NO_CLAUSE_AUTOLINK);

/*@internal*/
export function link(spec: Spec) {
  linkClause(spec, spec, new Map());
}

interface AutoLinkMap {
  [key: string]: Biblio.BiblioEntry;
}

function linkClause(spec: Spec, clause: Spec | Clause, replacerCache: Map<string, [AutoLinkMap, RegExp]>) {
  let autolinkmap: AutoLinkMap, clauseReplacer: RegExp;

  let entry = replacerCache.get(clause.namespace);
  if (entry) {
    autolinkmap = entry[0];
    clauseReplacer = entry[1];
  } else {
    autolinkmap = {};

    spec.biblio.inScopeByType(clause.namespace, 'term')
      .forEach(entry => autolinkmap[narrowSpace(entry.key!.toLowerCase())] = entry);

    spec.biblio.inScopeByType(clause.namespace, 'op')
      .forEach(entry => autolinkmap[narrowSpace(entry.key!.toLowerCase())] = entry);

    clauseReplacer = new RegExp(Object.keys(autolinkmap)
      .sort(function (a, b) { return b.length - a.length; })
      .map(function (k) {
        const entry = autolinkmap[k];
        const key = entry.key!;

        if (entry.type === 'term') {
          if (isCommonTerm(key)) {
            return '\\b' +
                   widenSpace(key) +
                   '\\b(?!\\.\\w|%%|\\]\\])';
          } else if (key[0].match(/[A-Za-z0-9]/)) {
            return '\\b' +
                   widenSpace(caseInsensitiveRegExp(key)) +
                   '\\b(?!\\.\\w|%%|\\]\\])';
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

  autolink(clauseReplacer, autolinkmap, spec, clause.node, (<Clause>clause).id);
  clause.subclauses.forEach(subclause => {
    linkClause(spec, subclause, replacerCache);
  });

  let algs = utils.nodesInClause(clause.node, ['EMU-ALG', 'EMU-EQN']) as HTMLElement[];
  for (let i = 0; i < algs.length; i++) {
    autolink(clauseReplacer, autolinkmap, spec, algs[i], clause.node.id, true);
  }
}

function autolink(replacer: RegExp, autolinkmap: AutoLinkMap, spec: Spec, node: HTMLElement, parentId: string, allowSameId?: boolean) {
  const textNodes = clauseTextNodesUnder(node);
  for (let i = 0; i < textNodes.length; i++) {
    const node = textNodes[i];

    const template = spec.doc.createElement('template');
    const content = escape(node.textContent!);
    const autolinked = content.replace(replacer, match => {
      const entry = autolinkmap[narrowSpace(match.toLowerCase())];
      if (!entry) {
        return match;
      }

      const entryId = entry.id || entry.refId;
      const skipLinking = !allowSameId && parentId && entryId === parentId;

      if (skipLinking) {
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

function isCommonAbstractOp(op: string) {
  return op === 'Call' || op === 'Set' || op === 'Type' || op === 'UTC' || op === 'min' || op === 'max';
}

function isCommonTerm(op: string) {
  return op === 'List' || op === 'Reference' || op === 'Record';
}

function caseInsensitiveRegExp(str: string) {
  let lower = str[0].toLowerCase();

  if (lower !== str[0]) return str;

  let upper = lower.toUpperCase();
  if (lower === upper) {
    return str;
  }

  return `[${lower}${upper}]${str.slice(1)}`;
}

// given a regexp string, returns a regexp string where each space can be
// many spaces or line breaks.
function widenSpace(str: string) {
  return str.replace(/\s+/g, '[\\s\\r\\n]+');
}

// given a regexp string, returns a regexp string where multiple spaces
// or linebreaks can only be a single space
function narrowSpace(str: string) {
  return str.replace(/[\s\r\n]+/g, ' ');
}

