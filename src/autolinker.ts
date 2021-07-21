import type Spec from './Spec';
import type Clause from './Clause';
import type Biblio from './Biblio';
import type { BiblioEntry } from './Biblio';

import Xref from './Xref';
import * as utils from './utils';

const escape: (_: string) => string = require('html-escape');

export const NO_CLAUSE_AUTOLINK = new Set([
  'PRE',
  'CODE',
  'EMU-CONST',
  'EMU-PRODUCTION',
  'EMU-GRAMMAR',
  'EMU-XREF',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'EMU-VAR',
  'EMU-VAL',
  'VAR',
  'A',
  'DFN',
  'SUB',
  'EMU-NOT-REF',
]);
export const YES_CLAUSE_AUTOLINK = new Set(['EMU-GMOD']); // these are processed even if they are nested in NO_CLAUSE_AUTOLINK contexts

export function autolink(
  node: Node,
  replacer: RegExp,
  autolinkmap: AutoLinkMap,
  clause: Clause | Spec,
  currentId: string | null,
  allowSameId: boolean
) {
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
    const newXrefs = newXrefNodes.map(
      node =>
        new Xref(
          spec,
          node as HTMLElement,
          clause as Clause,
          clause.namespace,
          node.getAttribute('href')!,
          node.getAttribute('aoid')!
        )
    );
    spec._xrefs = spec._xrefs.concat(newXrefs);
  }
}

export function replacerForNamespace(namespace: string, biblio: Biblio): [RegExp, AutoLinkMap] {
  const autolinkmap: AutoLinkMap = {};

  biblio
    .inScopeByType(namespace, 'term')
    .forEach(entry => (autolinkmap[narrowSpace(entry.key!.toLowerCase())] = entry));

  biblio
    .inScopeByType(namespace, 'op')
    .forEach(entry => (autolinkmap[narrowSpace(entry.key!.toLowerCase())] = entry));

  const clauseReplacer = new RegExp(regexpForList(autolinkmap, Object.keys(autolinkmap), 0), 'g');

  return [clauseReplacer, autolinkmap];
}

export interface AutoLinkMap {
  [key: string]: BiblioEntry;
}

function isCommonAbstractOp(op: string) {
  return (
    op === 'Call' || op === 'Set' || op === 'Type' || op === 'UTC' || op === 'min' || op === 'max'
  );
}

function isCommonTerm(op: string) {
  return op === 'List' || op === 'Reference' || op === 'Record';
}

function lookAheadBeyond(entry: BiblioEntry) {
  if (entry.type === 'term') {
    if (/^\w/.test(entry.key!)) {
      return '\\b(?!\\.\\w|%%|\\]\\])';
    } else {
      return '';
    }
  } else {
    // type is "op"
    if (isCommonAbstractOp(entry.key!)) {
      return '\\b(?=\\()';
    } else {
      return '\\b(?!\\.\\w|%%|\\]\\])';
    }
  }
}

// returns a regexp string where each space can be many spaces or line breaks.
function widenSpace(str: string) {
  return str.replace(/\s+/g, '\\s+');
}

// replaces multiple whitespace characters with a single space
function narrowSpace(str: string) {
  return str.replace(/\s+/g, ' ');
}

function regexpEscape(str: string) {
  return str.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
}

function regexpUnion(alternatives: string[]) {
  if (alternatives.length < 2) {
    return `${alternatives[0] ?? ''}`;
  }
  return `(?:${alternatives.join('|')})`;
}

// binary search for the longest common prefix in an array of strings
function longestCommonPrefix(items: string[], offset: number = 0) {
  let result = '';
  let low = offset;
  let high = items[0].length;
  OUTER: while (low < high) {
    const end = high - ((high - low) >>> 1);
    const prefix = items[0].slice(offset, end);
    for (let i = 1; i < items.length; ++i) {
      if (!items[i].startsWith(prefix, offset)) {
        high = end - 1;
        continue OUTER;
      }
    }
    low = end;
    result = prefix;
  }
  return result;
}

function regexpForList(autolinkmap: AutoLinkMap, autolinkkeys: string[], position: number) {
  const resultAlternatives: string[] = [];
  const wordStartAlternatives: string[] = [];
  const groups: { [char: string]: string[] } = {};

  const getEntry = (k: string) => autolinkmap[narrowSpace(k).toLowerCase()];

  for (const k of autolinkkeys) {
    const entry = getEntry(k);
    const key = narrowSpace(entry.key!);
    const char = key[position];
    let group = (groups[char] ??= []);
    group.push(key);
    if (position === 0 && /^[a-z]/.test(char)) {
      // include capitalized variant of words
      // starting with lowercase letter
      const upper = char.toUpperCase();
      group = groups[upper] ??= [];
      group.push(upper + key.slice(1));
    }
  }

  const matchEmpty = '' in groups;
  if (matchEmpty) {
    delete groups[''];
  }

  const longestFirst = (a: string, b: string) => b.length - a.length;

  for (const groupChar of Object.keys(groups).sort()) {
    // sort by length to ensure longer keys are tested first
    const groupItems = groups[groupChar].sort(longestFirst);
    const prefix = longestCommonPrefix(groupItems, position);
    const prefixRegex = widenSpace(regexpEscape(prefix));
    const suffixPos = position + prefix.length;
    let suffixRegex: string;

    if (groupItems.length > 5) {
      // recursively split the group into smaller chunks
      suffixRegex = regexpForList(autolinkmap, groupItems, suffixPos);
    } else {
      suffixRegex = regexpUnion(
        groupItems.map(k => {
          const item = widenSpace(regexpEscape(k.slice(suffixPos)));
          return item + lookAheadBeyond(getEntry(k));
        })
      );
    }
    if (position === 0 && /^\w/.test(prefix)) {
      wordStartAlternatives.push(prefixRegex + suffixRegex);
    } else {
      resultAlternatives.push(prefixRegex + suffixRegex);
    }
  }

  if (matchEmpty) {
    resultAlternatives.push('');
  }
  if (wordStartAlternatives.length) {
    resultAlternatives.unshift('\\b' + regexpUnion(wordStartAlternatives));
  }

  // prettier-ignore
  return position === 0
    ? resultAlternatives.join('|')
    : regexpUnion(resultAlternatives);
}
