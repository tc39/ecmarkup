import type { default as Spec, Warning } from '../Spec';

import { collectNodes } from './collect-nodes';
import { collectGrammarDiagnostics } from './collect-grammar-diagnostics';
import { collectSpellingDiagnostics } from './collect-spelling-diagnostics';
import { collectAlgorithmDiagnostics } from './collect-algorithm-diagnostics';
import { collectHeaderDiagnostics } from './collect-header-diagnostics';
import { collectTagDiagnostics } from './collect-tag-diagnostics';
import type { AugmentedGrammarEle } from '../Grammar';
import type { AlgorithmElementWithTree } from '../Algorithm';

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

  const collection = collectNodes(report, sourceText, spec, document);
  if (!collection.success) {
    return;
  }
  const { mainGrammar, headers, sdos, earlyErrors, algorithms } = collection;

  const { grammar, oneOffGrammars } = await collectGrammarDiagnostics(
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
    const name = +file.split('.')[0];
    const node = mainGrammar[name].element;
    if ('grammarkdownOut' in node) {
      throw new Error('unexpectedly regenerating grammarkdown output for node ' + name);
    }
    if (name !== +grammar.sourceFiles[name].filename) {
      throw new Error(
        `grammarkdown file mismatch: ${name} vs ${grammar.sourceFiles[name].filename}. This is a bug in ecmarkup; please report it.`
      );
    }
    (node as AugmentedGrammarEle).grammarkdownOut = source;
    (node as AugmentedGrammarEle).grammarSource = grammar.sourceFiles[name];
  });
  for (const { grammarEle, grammar } of oneOffGrammars) {
    await grammar.emit(undefined, (file, source) => {
      if ('grammarkdownOut' in grammarEle) {
        throw new Error('unexpectedly regenerating grammarkdown output');
      }
      if (grammar.rootFiles.length !== 1) {
        throw new Error(
          `grammarkdown file count mismatch: ${grammar.rootFiles.length}. This is a bug in ecmarkup; please report it.`
        );
      }
      (grammarEle as AugmentedGrammarEle).grammarkdownOut = source;
      (grammarEle as AugmentedGrammarEle).grammarSource = grammar.rootFiles[0];
    });
  }

  for (const pair of algorithms) {
    if ('tree' in pair) {
      const element = pair.element as AlgorithmElementWithTree;
      element.ecmarkdownTree = pair.tree ?? null;
      element.originalHtml = pair.element.innerHTML;
    }
  }
}
