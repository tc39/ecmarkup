import type { default as Spec, Warning } from '../Spec';

import type { Node as EcmarkdownNode } from 'ecmarkdown';

type CollectNodesReturnType =
  | {
      success: true;
      headers: { element: Element; contents: string }[];
      mainGrammar: { element: Element; source: string }[];
      sdos: { grammar: Element; alg: Element }[];
      earlyErrors: { grammar: Element; lists: HTMLUListElement[] }[];
      algorithms: { element: Element; tree?: EcmarkdownNode }[];
    }
  | {
      success: false;
    };

export function collectNodes(
  report: (e: Warning) => void,
  mainSource: string,
  spec: Spec,
  document: Document
): CollectNodesReturnType {
  let headers: { element: Element; contents: string }[] = [];
  let mainGrammar: { element: Element; source: string }[] = [];
  let sdos: { grammar: Element; alg: Element }[] = [];
  let earlyErrors: { grammar: Element; lists: HTMLUListElement[] }[] = [];
  let algorithms: { element: Element; tree?: EcmarkdownNode }[] = [];

  let failed = false;

  let inAnnexB = false;
  let lintWalker = document.createTreeWalker(document.body, 1 /* elements */);
  function visitCurrentNode() {
    let node: Element = lintWalker.currentNode as Element;

    let thisNodeIsAnnexB =
      node.nodeName === 'EMU-ANNEX' &&
      node.id === 'sec-additional-ecmascript-features-for-web-browsers';
    if (thisNodeIsAnnexB) {
      inAnnexB = true;
    }

    // Don't bother collecting early errors and SDOs from Annex B.
    // This is mostly so we don't have to deal with having two inconsistent copies of some of the grammar productions.
    if (!inAnnexB) {
      if (node.nodeName === 'EMU-CLAUSE') {
        // Look for early errors
        let first = node.firstElementChild;
        if (first !== null && first.nodeName === 'H1') {
          let title = textContentExcludingDeleted(first);
          headers.push({ element: first, contents: title });
          if (title.trim() === 'Static Semantics: Early Errors') {
            let grammar = null;
            let lists: HTMLUListElement[] = [];
            for (let child of (node.children as any) as Iterable<Element>) {
              if (child.nodeName === 'EMU-GRAMMAR') {
                if (grammar !== null) {
                  if (lists.length === 0) {
                    // TODO soft errors
                    throw new Error(
                      'unrecognized structure for early errors: grammar without errors'
                    );
                  }
                  earlyErrors.push({ grammar, lists });
                }
                grammar = child;
                lists = [];
              } else if (child.nodeName === 'UL') {
                if (grammar === null) {
                  throw new Error(
                    'unrecognized structure for early errors: errors without corresponding grammar'
                  );
                }
                lists.push(child as HTMLUListElement);
              }
            }
            if (grammar === null) {
              throw new Error('unrecognized structure for early errors: no grammars');
            }
            if (lists.length === 0) {
              throw new Error('unrecognized structure for early errors: grammar without errors');
            }
            earlyErrors.push({ grammar, lists });
          }
        }
      } else if (node.nodeName === 'EMU-GRAMMAR' && !node.hasAttribute('example')) {
        // Look for grammar definitions and SDOs
        if (node.getAttribute('type') === 'definition') {
          const loc = spec.locate(node);
          if (!loc) return;

          let { source: importSource } = loc;
          if (loc.endTag == null) {
            failed = true;
            report({
              type: 'node',
              ruleId: 'missing-close-tag',
              message: 'could not find closing tag for emu-grammar',
              node,
            });
          } else {
            let start = loc.startTag.endOffset;
            let end = loc.endTag.startOffset;
            let realSource = (importSource ?? mainSource).slice(start, end);
            mainGrammar.push({ element: node as Element, source: realSource });
          }
        } else {
          let next = lintWalker.nextSibling() as Element;
          if (next) {
            if (next.nodeName === 'EMU-ALG') {
              sdos.push({ grammar: node, alg: next });
            }
            lintWalker.previousSibling();
          }
        }
      }
    }

    if (node.nodeName === 'EMU-ALG' && !node.hasAttribute('example')) {
      algorithms.push({ element: node });
    }

    let firstChild = lintWalker.firstChild();
    if (firstChild) {
      while (true) {
        visitCurrentNode();
        let next = lintWalker.nextSibling();
        if (!next) break;
      }
      lintWalker.parentNode();
    }

    if (thisNodeIsAnnexB) {
      inAnnexB = false;
    }
  }
  visitCurrentNode();

  if (failed) {
    return { success: false };
  }

  return { success: true, mainGrammar, headers, sdos, earlyErrors, algorithms };
}

function textContentExcludingDeleted(node: Node): string {
  let retval = '';
  node.childNodes.forEach(value => {
    if (value.nodeType === 3) {
      retval += value.nodeValue;
    } else if (value.nodeType !== 1 || (value as Element).tagName !== 'DEL') {
      retval += textContentExcludingDeleted(value);
    }
  });
  return retval;
}
