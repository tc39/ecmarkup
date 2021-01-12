import type { default as Spec, Warning } from '../Spec';

const ruleId = 'valid-tags';

let knownEmuTags = new Set([
  'emu-import',
  'emu-example',
  'emu-intro',
  'emu-clause',
  'emu-annex',
  'emu-biblio',
  'emu-xref',
  'emu-prodref',
  'emu-not-ref',
  'emu-note',
  'emu-eqn',
  'emu-table',
  'emu-figure',
  'emu-caption',
  'emu-grammar',
  'emu-alg',
  'emu-var',
  'emu-val',
  'emu-production',
  'emu-rhs',
  'emu-nt',
  'emu-t',
  'emu-gann',
  'emu-gprose',
  'emu-gmod',
  'emu-normative-optional', // used in ecma-402
]);

export function collectTagDiagnostics(
  report: (e: Warning) => void,
  spec: Spec,
  document: Document
) {
  let lintWalker = document.createTreeWalker(document.body, 1 /* elements */);
  function visit() {
    let node: Element = lintWalker.currentNode as Element;
    let name = node.tagName.toLowerCase();

    if (name.startsWith('emu-') && !knownEmuTags.has(name)) {
      report({
        type: 'node',
        ruleId,
        message: `unknown "emu-" tag "${name}"`,
        node,
      });
    }

    if (node.hasAttribute('oldid')) {
      report({
        type: 'attr',
        attr: 'oldid',
        ruleId,
        message: `"oldid" isn't a thing; did you mean "oldids"?`,
        node,
      });
    }

    let firstChild = lintWalker.firstChild();
    if (firstChild) {
      while (true) {
        visit();
        let next = lintWalker.nextSibling();
        if (!next) break;
      }
      lintWalker.parentNode();
    }
  }
  visit();
}
