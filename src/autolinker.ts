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
    const entry = autolinkmap[narrowSpace(match)];
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

export function replacerForNamespace(
  namespace: string,
  biblio: Biblio
): { replacer: RegExp; autolinkmap: AutoLinkMap } {
  const autolinkmap: AutoLinkMap = biblio.getDefinedWords(namespace);

  const replacer = new RegExp(
    regexpPatternForAutolinkKeys(autolinkmap, Object.keys(autolinkmap), 0),
    'g'
  );

  return { replacer, autolinkmap };
}

export interface AutoLinkMap {
  [key: string]: BiblioEntry;
}

function isCommonAbstractOp(op: string) {
  return (
    op === 'Call' || op === 'Set' || op === 'Type' || op === 'UTC' || op === 'min' || op === 'max'
  );
}

function lookAheadBeyond(entry: BiblioEntry) {
  if (isCommonAbstractOp(entry.key)) {
    // must be followed by parentheses
    return '\\b(?=\\()';
  }
  if (entry.type !== 'term' || /^\w/.test(entry.key)) {
    // must not be followed by `.word` or `%%` or `]]`
    return '\\b(?!\\.\\w|%%|\\]\\])';
  }
  return '';
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

// Search a non-empty array of string `items` for the longest common
// substring starting at position `beginIndex`. The part of each string
// before `beginIndex` is ignored, and is not included in the result.
function longestCommonPrefix(items: string[], beginIndex: number = 0) {
  let endIndex = beginIndex;
  OUTER: while (endIndex < items[0].length) {
    const char = items[0][endIndex];
    for (let i = 1; i < items.length; ++i) {
      if (char !== items[i][endIndex]) {
        break OUTER;
      }
    }
    ++endIndex;
  }
  return items[0].slice(beginIndex, endIndex);
}

function regexpPatternForAutolinkKeys(
  autolinkmap: AutoLinkMap,
  subsetKeys: string[],
  initialCommonLength: number
) {
  const resultAlternatives: string[] = [];
  const wordStartAlternatives: string[] = [];
  const groups: { [char: string]: string[] } = {};

  for (const key of subsetKeys) {
    const char = key[initialCommonLength];
    const group = (groups[char] ??= []);
    group.push(key);
  }

  const matchEmpty = '' in groups;
  if (matchEmpty) {
    delete groups[''];
  }

  const longestFirst = (a: string, b: string) => b.length - a.length;

  for (const groupChar of Object.keys(groups).sort()) {
    // sort by length to ensure longer keys are tested first
    const groupItems = groups[groupChar].sort(longestFirst);
    const prefix = longestCommonPrefix(groupItems, initialCommonLength);
    const prefixRegex = widenSpace(regexpEscape(prefix));
    const suffixPos = initialCommonLength + prefix.length;
    let suffixRegex: string;

    if (groupItems.length > 5) {
      // recursively split the group into smaller chunks
      suffixRegex = regexpPatternForAutolinkKeys(autolinkmap, groupItems, suffixPos);
    } else {
      suffixRegex = regexpUnion(
        groupItems.map(k => {
          const item = widenSpace(regexpEscape(k.slice(suffixPos)));
          return item + lookAheadBeyond(autolinkmap[k]);
        })
      );
    }
    if (initialCommonLength === 0 && /^\w/.test(prefix)) {
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

  return regexpUnion(resultAlternatives);
}
