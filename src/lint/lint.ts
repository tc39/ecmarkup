import type { Warning } from '../Spec';
import { emit } from 'ecmarkdown';

import { collectNodes } from './collect-nodes';
import { collectGrammarDiagnostics } from './collect-grammar-diagnostics';
import { collectSpellingDiagnostics } from './collect-spelling-diagnostics';
import { collectAlgorithmDiagnostics } from './collect-algorithm-diagnostics';
import { collectHeaderDiagnostics } from './collect-header-diagnostics';

/*
Currently this checks
- grammarkdown's built-in sanity checks
- the productions in the definition of each early error and SDO are defined in the main grammar
- those productions do not include `[no LineTerminator here]` restrictions or `[+flag]` gating
- the algorithm linting rules imported above
- headers of abstract operations have consistent spacing
- certain common spelling errors

There's more to do:
https://github.com/tc39/ecmarkup/issues/173
*/
export function lint(
  report: (err: Warning) => void,
  sourceText: string,
  dom: any,
  document: Document
) {
  let collection = collectNodes(report, sourceText, dom, document);
  if (!collection.success) {
    return;
  }
  let { mainGrammar, headers, sdos, earlyErrors, algorithms } = collection;

  let { grammar } = collectGrammarDiagnostics(
    report,
    dom,
    sourceText,
    mainGrammar,
    sdos,
    earlyErrors
  );

  collectAlgorithmDiagnostics(report, dom, sourceText, algorithms);

  collectHeaderDiagnostics(report, dom, headers);

  collectSpellingDiagnostics(report, sourceText);

  // Stash intermediate results for later use
  // This isn't actually necessary for linting, but we might as well avoid redoing work later when we can.

  grammar.emitSync(undefined, (file, source) => {
    let name = +file.split('.')[0];
    let node = mainGrammar[name].element;
    if ('grammarkdownOut' in node) {
      throw new Error('unexpectedly regenerating grammarkdown output for node ' + name);
    }
    // @ts-ignore we are intentionally adding a property here
    node.grammarkdownOut = source;
  });
  // for (let { grammarEle, grammar } of oneOffGrammars) {
  //   grammar.emitSync(undefined, (file, source) => {
  //     if ('grammarkdownOut' in grammarEle) {
  //       throw new Error('unexpectedly regenerating grammarkdown output');
  //     }
  //     // @ts-ignore we are intentionally adding a property here
  //     grammarEle.grammarkdownOut = source;
  //   });
  // }
  for (let { element, tree } of algorithms) {
    if (tree != null) {
      // @ts-ignore we are intentionally adding a property here
      element.ecmarkdownTree = tree;
    }
  }
}
