import Spec from './Spec';
import Clause from './Clause';
import Xref from './Xref';
import Biblio, { BiblioEntry } from './Biblio';
import escape = require('html-escape');
import utils = require('./utils');

export const NO_CLAUSE_AUTOLINK = new Set([
  'PRE',
  'CODE',
  'EMU-PRODUCTION',
  'EMU-GRAMMAR',
  'EMU-XREF',
  'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
  'EMU-VAR',
  'EMU-VAL',
  'VAR',
  'A',
  'DFN'
]);

export function autolink(node: Node, replacer: RegExp, autolinkmap: AutoLinkMap, clause: Clause | Spec, currentId: string | null, allowSameId: boolean) {
  const spec = clause.spec;
  const template = spec.doc.createElement('template');
  const content = escape(node.textContent!);
  const autolinked = content.replace(replacer, match => {
    const entry = autolinkmap[narrowSpace(match.toLowerCase())];
    if (!entry) {
      return match;
    }

    const entryId = entry.id || entry.refId;
    
    const skipLinking = !allowSameId && currentId && entryId === currentId;
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
    const newXrefNodes = utils.replaceTextNode(node, template.content);
    const newXrefs = newXrefNodes.map(node =>
      new Xref(spec, node as HTMLElement, clause as Clause, clause.namespace, node.getAttribute('href')!, node.getAttribute('aoid')!)
    )
    spec._xrefs = spec._xrefs.concat(newXrefs);
  }
}

export function replacerForNamespace(namespace: string, biblio: Biblio) : [RegExp, AutoLinkMap] {
  const autolinkmap: AutoLinkMap = {};

  biblio.inScopeByType(namespace, 'term')
    .forEach(entry => autolinkmap[narrowSpace(entry.key!.toLowerCase())] = entry);

  biblio.inScopeByType(namespace, 'op')
    .forEach(entry => autolinkmap[narrowSpace(entry.key!.toLowerCase())] = entry);

  const clauseReplacer = new RegExp(Object.keys(autolinkmap)
    .sort(function (a, b) { return b.length - a.length; })
    .map(function (k) {
      
      const entry = autolinkmap[k];
      const key = regexpEscape(entry.key!);

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

  return [clauseReplacer, autolinkmap];
}

export interface AutoLinkMap {
  [key: string]: BiblioEntry;
}

function isCommonAbstractOp(op: string) {
  return op === 'Call' || op === 'Set' || op === 'Type' || op === 'UTC' || op === 'min' || op === 'max';
}

function isCommonTerm(op: string) {
  return op === 'List' || op === 'Reference' || op === 'Record';
}

// regexp-string where the first character is case insensitive
function caseInsensitiveRegExp(str: string) {
  let lower = str[0].toLowerCase();

  if (lower !== str[0]) return str;

  let upper = lower.toUpperCase();
  if (lower === upper) {
    return str;
  }

  return `[${lower}${upper}]${str.slice(1)}`;
}

// returns a regexp string where each space can be many spaces or line breaks.
function widenSpace(str: string) {
  return str.replace(/\s+/g, '[\\s\\r\\n]+');
}

// replaces multiple whitespace characters with a single space
function narrowSpace(str: string) {
  return str.replace(/[\s\r\n]+/g, ' ');
}

function regexpEscape(str: string) {
  return str.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
}