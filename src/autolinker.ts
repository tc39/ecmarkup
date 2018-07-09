import Spec from './Spec';
import Clause from './Clause';
import Xref from './Xref';
import Biblio, { BiblioEntry } from './Biblio';
import escape = require('html-escape');
import utils = require('./utils');
import { Context } from './Context';

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

const COMMON_ABSTRACT_OP = new Set(['Call', 'Set', 'Type', 'UTC', 'min', 'max']);
const COMMON_TERM = new Set(['List', 'Reference', 'Record']);
const autolinkTemplateCache = new WeakMap();

export function autolink(node: Node, replacer: RegExp, autolinkmap: AutoLinkMap, clause: Clause | Spec, currentId: string | null, allowSameId: boolean) {
  const spec = clause.spec;
  const content = escape(node.textContent!);
  const autolinked = content.replace(replacer, (match, boundary, ref) => {
    const entry = autolinkmap[narrowSpace(ref.toLowerCase())];
    if (!entry) {
      return match;
    }

    const entryId = entry.id || entry.refId;
    
    const skipLinking = !allowSameId && currentId && entryId === currentId;
    if (skipLinking) {
      return match;
    }

    if (entry.aoid) {
      return boundary + '<emu-xref aoid="' + entry.aoid + '">' + ref + '</emu-xref>';
    } else {
      return boundary + '<emu-xref href="#' + entryId + '">' + ref + '</emu-xref>';
    }
  });

  if (autolinked !== content) {
    let template = autolinkTemplateCache.get(spec);
    if ( !template ) {
      template = spec.doc.createElement('template');
      autolinkTemplateCache.set(spec, template);
    }
    template.innerHTML = autolinked;
    const newXrefNodes = utils.replaceTextNode(node, template.content);
    const newXrefs = newXrefNodes.map(node =>
      new Xref(spec, node as HTMLElement, clause as Clause, clause.namespace, node.getAttribute('href')!, node.getAttribute('aoid')!)
    )
    spec._xrefs.push.apply(spec._xrefs, newXrefs);
  }
}

export function replacerForNamespace(namespace: string, biblio: Biblio) : [RegExp, AutoLinkMap] {
  const autolinkmap: AutoLinkMap = {};

  biblio.inScopeByType(namespace, 'term')
    .forEach(entry => autolinkmap[narrowSpace(entry.key!.toLowerCase())] = entry);

  biblio.inScopeByType(namespace, 'op')
    .forEach(entry => autolinkmap[narrowSpace(entry.key!.toLowerCase())] = entry);

  const patterns = Object.keys(autolinkmap)
    .sort(function (a, b) { return b.length - a.length; })
    .map(function (k) {
      const entry = autolinkmap[k];
      let pattern = regexpEscape(entry.key!);

      if (entry.type === 'term') {
        // expand patterns for fuzzy matching as appropriate
        if (!COMMON_TERM.has(pattern)) {
          const alphanumericStart = /^([a-z])|^[A-Z0-9]/.exec(pattern);

          // if the first character is special, we'll only link exact matches (ignoring context)
          if (alphanumericStart === null) {
            return pattern;
          }

          // always allow the first character to be uppercase
          const lowercaseStart = alphanumericStart[1];
          if (lowercaseStart) {
            pattern = '[' + lowercaseStart + lowercaseStart.toUpperCase() + ']' + pattern.slice(1);
          }

          // allow arbitrary whitespace combinations
          pattern = widenSpace(pattern);
        }
      } else {
        // type is "op"

        // we'll only link to common operations at invocation sites
        if (COMMON_ABSTRACT_OP.has(pattern)) {
          return pattern + '(?=\\()';
        }
      }

      // we only want to link isolated references, and specifically skip:
      // * text inside other words, e.g. `${term}ed`
      // * references followed by member access, e.g. `${term}.length`
      // * references as slot names, e.g. `[[${term}]]`
      // * references wrapped in double percent signs, e.g. `%%${term}%%`
      return pattern + '(?!\\.?\\w|\\]\\]|%%)';
    });
  const clauseReplacer = new RegExp('(^|\\W)(' + patterns.join('|') + ')', 'g');

  return [clauseReplacer, autolinkmap];
}

export interface AutoLinkMap {
  [key: string]: BiblioEntry;
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
