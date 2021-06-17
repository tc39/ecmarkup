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
  const headers: { element: Element; contents: string }[] = [];
  const mainGrammar: { element: Element; source: string }[] = [];
  const sdos: { grammar: Element; alg: Element }[] = [];
  const earlyErrors: { grammar: Element; lists: HTMLUListElement[] }[] = [];
  const algorithms: { element: Element; tree?: EcmarkdownNode }[] = [];

  let failed = false;

  let inAnnexB = false;
  const lintWalker = document.createTreeWalker(document.body, 1 /* elements */);
  function visitCurrentNode() {
    const node: Element = lintWalker.currentNode as Element;

    const thisNodeIsAnnexB =
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
        const first = node.firstElementChild;
        if (first !== null && first.nodeName === 'H1') {
          const title = textContentExcludingDeleted(first);
          headers.push({ element: first, contents: title });
          if (title.trim() === 'Static Semantics: Early Errors') {
            let grammar = null;
            let lists: HTMLUListElement[] = [];
            for (const child of node.children as any as Iterable<Element>) {
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

          const { source: importSource } = loc;
          if (loc.endTag == null) {
            failed = true;
            // we'll warn for this in collect-tag-diagnostics; no need to do so here
          } else {
            const start = loc.startTag.endOffset;
            const end = loc.endTag.startOffset;
            const realSource = (importSource ?? mainSource).slice(start, end);
            mainGrammar.push({ element: node as Element, source: realSource });
          }
        } else {
          const next = lintWalker.nextSibling() as Element;
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

    const firstChild = lintWalker.firstChild();
    if (firstChild) {
      while (true) {
        visitCurrentNode();
        const next = lintWalker.nextSibling();
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
