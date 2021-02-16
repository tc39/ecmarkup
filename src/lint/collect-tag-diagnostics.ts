import type { default as Spec, Warning } from '../Spec';

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

// https://html.spec.whatwg.org/multipage/syntax.html#void-elements
let voidElements = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
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
        ruleId: 'valid-tags',
        message: `unknown "emu-" tag "${name}"`,
        node,
      });
    }

    if (node.hasAttribute('oldid')) {
      report({
        type: 'attr',
        attr: 'oldid',
        ruleId: 'valid-tags',
        message: `"oldid" isn't a thing; did you mean "oldids"?`,
        node,
      });
    }

    if (!voidElements.has(name)) {
      let location = spec.locate(node);
      if (location != null && location.endTag == null) {
        report({
          type: 'node',
          ruleId: 'missing-closing-tag',
          message: `element is missing its closing tag`,
          node,
        });
      }
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
