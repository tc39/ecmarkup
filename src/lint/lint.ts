import type { Node as EcmarkdownNode, Observer } from 'ecmarkdown';

import type { Reporter } from './algorithm-error-reporter-type';

import { parseAlgorithm, visit, emit } from 'ecmarkdown';

import { getLocation } from './utils';
import { collectNodes } from './collect-nodes';
import { collectGrammarDiagnostics } from './collect-grammar-diagnostics';
import lintAlgorithmLineEndings from './rules/algorithm-line-endings';

function composeObservers(...observers: Observer[]): Observer {
  return {
    enter(node: EcmarkdownNode) {
      for (let observer of observers) {
        observer.enter?.(node);
      }
    },
    exit(node: EcmarkdownNode) {
      for (let observer of observers) {
        observer.exit?.(node);
      }
    },
  };
}

let algorithmRules = [lintAlgorithmLineEndings];

export type LintingError = { line: number; column: number; message: string };

/*
Currently this checks
- grammarkdown's built-in sanity checks
- the productions in the definition of each early error and SDO are defined in the main grammar
- those productions do not include `[no LineTerminator here]` restrictions or `[+flag]` gating
- the algorithm linting rules imported above

There's more to do:
https://github.com/tc39/ecmarkup/issues/173
*/
export function lint(
  report: (errors: LintingError[]) => void,
  sourceText: string,
  dom: any,
  document: Document
) {
  // *******************
  // Walk the whole tree collecting interesting parts

  let { mainGrammar, sdos, earlyErrors, algorithms } = collectNodes(sourceText, dom, document);

  // *******************
  // Parse the grammar with Grammarkdown and collect its diagnostics, if any

  let { grammar, oneOffGrammars, lintingErrors } = collectGrammarDiagnostics(
    dom,
    sourceText,
    mainGrammar,
    sdos,
    earlyErrors
  );

  // *******************
  // Enforce algorithm-specific linting rules

  for (let algorithm of algorithms) {
    let element = algorithm.element;
    let location = getLocation(dom, element);

    let reporter: Reporter = ({
      line,
      column,
      message,
    }: {
      line: number;
      column: number;
      message: string;
    }) => {
      // jsdom's lines and columns are both 1-based
      // ecmarkdown has 1-based line numbers and 0-based column numbers
      // we want 1-based for both
      let trueLine = location.startTag.line + line - 1;
      let trueCol = column;
      if (line === 1) {
        trueCol +=
          location.startTag.col + (location.startTag.endOffset - location.startTag.startOffset);
      } else {
        trueCol += 1;
      }
      lintingErrors.push({ line: trueLine, column: trueCol, message });
    };

    let observer = composeObservers(...algorithmRules.map(f => f(reporter, element)));
    let tree = parseAlgorithm(
      sourceText.slice(location.startTag.endOffset, location.endTag.startOffset),
      { trackPositions: true }
    );
    visit(tree, observer);
    algorithm.tree = tree;
  }

  // *******************
  // Report errors, if any

  if (lintingErrors.length > 0) {
    lintingErrors.sort((a, b) => a.line - b.line);
    report(lintingErrors);
  }

  // *******************
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
  for (let { grammarEle, grammar } of oneOffGrammars) {
    grammar.emitSync(undefined, (file, source) => {
      if ('grammarkdownOut' in grammarEle) {
        throw new Error('unexpectedly regenerating grammarkdown output');
      }
      // @ts-ignore we are intentionally adding a property here
      grammarEle.grammarkdownOut = source;
    });
  }
  for (let { element, tree } of algorithms) {
    // @ts-ignore we are intentionally adding a property here
    element.ecmarkdownOut = emit(tree!);
  }
}
