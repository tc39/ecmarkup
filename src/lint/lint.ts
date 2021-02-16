import type { default as Spec, Warning } from '../Spec';

import { collectNodes } from './collect-nodes';
import { collectGrammarDiagnostics } from './collect-grammar-diagnostics';
import { collectSpellingDiagnostics } from './collect-spelling-diagnostics';
import { collectAlgorithmDiagnostics } from './collect-algorithm-diagnostics';
import { collectHeaderDiagnostics } from './collect-header-diagnostics';
import { collectTagDiagnostics } from './collect-tag-diagnostics';

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
export async function lint(
  report: (err: Warning) => void,
  sourceText: string,
  spec: Spec,
  document: Document
) {
  collectSpellingDiagnostics(report, sourceText, spec.imports);

  collectTagDiagnostics(report, spec, document);

  let collection = collectNodes(report, sourceText, spec, document);
  if (!collection.success) {
    return;
  }
  let { mainGrammar, headers, sdos, earlyErrors, algorithms } = collection;

  let { grammar, oneOffGrammars } = await collectGrammarDiagnostics(
    report,
    spec,
    sourceText,
    mainGrammar,
    sdos,
    earlyErrors
  );

  collectAlgorithmDiagnostics(report, spec, sourceText, algorithms);

  collectHeaderDiagnostics(report, headers);

  // Stash intermediate results for later use
  // This isn't actually necessary for linting, but we might as well avoid redoing work later when we can.

  await grammar.emit(undefined, (file, source) => {
    let name = +file.split('.')[0];
    let node = mainGrammar[name].element;
    if ('grammarkdownOut' in node) {
      throw new Error('unexpectedly regenerating grammarkdown output for node ' + name);
    }
    // @ts-ignore we are intentionally adding a property here
    node.grammarkdownOut = source;
  });
  for (let { grammarEle, grammar } of oneOffGrammars) {
    await grammar.emit(undefined, (file, source) => {
      if ('grammarkdownOut' in grammarEle) {
        throw new Error('unexpectedly regenerating grammarkdown output');
      }
      // @ts-ignore we are intentionally adding a property here
      grammarEle.grammarkdownOut = source;
    });
  }

  for (let pair of algorithms) {
    if ('tree' in pair) {
      // @ts-ignore we are intentionally adding a property here
      pair.element.ecmarkdownTree = pair.tree;
    }
  }
}
