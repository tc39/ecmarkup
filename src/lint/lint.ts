import type { Node as EcmarkdownNode, Observer } from 'ecmarkdown';

import type { Reporter } from './algorithm-error-reporter-type';

import { parseAlgorithm, visit, emit } from 'ecmarkdown';
import {
  Grammar as GrammarFile,
  SyncHost,
  EmitFormat,
  Parser as GrammarParser,
  SyntaxKind,
  SymbolSpan,
  Diagnostics,
  Production,
  Parameter,
  skipTrivia,
} from 'grammarkdown';

import { getLocation, getProductions, rhsMatches } from './utils';
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

  let grammarNodes: Node[] = [];
  let grammarParts: string[] = [];
  let grammarStartOffsets: number[] = [];
  let grammarLineOffsets: number[] = [];

  let sdos: { grammar: Element; alg: Element }[] = [];
  let earlyErrors: { grammar: Element; lists: HTMLUListElement[] }[] = [];
  let algorithms: { element: Element; tree?: EcmarkdownNode }[] = [];
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
          let title = first.textContent ?? '';
          if (title.trim() === 'Static Semantics: Early Errors') {
            let grammar = null;
            let lists: HTMLUListElement[] = [];
            for (let child of (node.children as any) as Iterable<Element>) {
              if (child.nodeName === 'EMU-GRAMMAR') {
                if (grammar !== null) {
                  if (lists.length === 0) {
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
                    'unrecognized structure for early errors: errors without correspondinig grammar'
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
      } else if (node.nodeName === 'EMU-GRAMMAR') {
        // Look for grammar definitions and SDOs
        if (node.getAttribute('type') === 'definition') {
          let loc = getLocation(dom, node);
          let start = loc.startTag.endOffset;
          let end = loc.endTag.startOffset;
          grammarStartOffsets.push(start);
          grammarLineOffsets.push(loc.startTag.line);
          let realSource = sourceText.slice(start, end);
          grammarParts.push(realSource);
          grammarNodes.push(node);
        } else if (node.getAttribute('type') !== 'example') {
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

    if (node.nodeName === 'EMU-ALG' && node.getAttribute('type') !== 'example') {
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

  // *******************
  // Parse the grammar with Grammarkdown and collect its diagnostics, if any

  let grammarParser = new GrammarParser();
  // TODO use CoreSyncHost once published
  let fakeHost: SyncHost = {
    readFileSync(file: string) {
      let idx = parseInt(file);
      if (idx.toString() !== file || idx < 0 || idx >= grammarParts.length) {
        throw new Error('tried to read non-existent ' + file);
      }
      return grammarParts[idx];
    },
    resolveFile(file: string) {
      return file;
    },
    normalizeFile(file: string) {
      return file;
    },
    getSourceFileSync(file: string) {
      return grammarParser.parseSourceFile(file, this.readFileSync(file));
    },
  } as any; // good enough!
  let compilerOptions = {
    format: EmitFormat.ecmarkup,
    noChecks: false,
    noUnusedParameters: true,
  };
  let grammar = new GrammarFile(Object.keys(grammarParts), compilerOptions, fakeHost);
  grammar.parseSync();
  grammar.checkSync();

  let lintingErrors: LintingError[] = [];
  let unusedParameterErrors: Map<string, Map<string, LintingError>> = new Map();

  if (grammar.diagnostics.size > 0) {
    // `detailedMessage: false` prevents prepending line numbers, which is good because we're going to make our own
    grammar.diagnostics
      .getDiagnosticInfos({ formatMessage: true, detailedMessage: false })
      .forEach(m => {
        let idx = +m.sourceFile!.filename;
        let trueLine = grammarLineOffsets[idx] + m.range!.start.line;
        let trueCol = m.range!.start.character + 1; // column numbers are traditionally one-based
        let error = { line: trueLine, column: trueCol, message: m.formattedMessage! };
        lintingErrors.push(error);

        if (m.code === Diagnostics.Parameter_0_is_unused.code) {
          let param = m.node as Parameter;
          let navigator = grammar.resolver.createNavigator(param)!;
          navigator.moveToAncestor(node => node.kind === SyntaxKind.Production);
          let nodeName = (navigator.getNode() as Production).name.text!;
          let paramName = param.name.text!;
          if (!unusedParameterErrors.has(nodeName)) {
            unusedParameterErrors.set(nodeName, new Map());
          }
          let paramToError = unusedParameterErrors.get(nodeName)!;
          if (paramToError.has(paramName)) {
            throw new Error(
              'duplicate warning for unused parameter ' + paramName + ' of ' + nodeName
            );
          }
          paramToError.set(paramName, error);
        }
      });
  }

  // *******************
  // Check that SDOs and Early Errors are defined in terms of productions which actually exist

  let oneOffGrammars: { grammarEle: Element; grammar: GrammarFile }[] = [];
  let actualGrammarProductions = getProductions(grammar);
  let grammarsAndRules = [
    ...sdos.map(s => ({ grammar: s.grammar, rules: [s.alg], type: 'syntax-directed operation' })),
    ...earlyErrors.map(e => ({ grammar: e.grammar, rules: e.lists, type: 'early error' })),
  ];
  for (let { grammar: grammarEle, rules: rulesEles, type } of grammarsAndRules) {
    let grammarLoc = getLocation(dom, grammarEle);
    let grammarHost = SyncHost.forFile(
      sourceText.slice(grammarLoc.startTag.endOffset, grammarLoc.endTag.startOffset)
    );
    let grammar = new GrammarFile([grammarHost.file], {}, grammarHost);
    grammar.parseSync();
    oneOffGrammars.push({ grammarEle, grammar });
    let productions = getProductions(grammar);

    function getLocationInGrammar(pos: number) {
      let file = grammar.sourceFiles[0];
      let posWithoutWhitespace = skipTrivia(file.text, pos, file.text.length);
      let { line, character } = file.lineMap.positionAt(posWithoutWhitespace);
      let trueLine = grammarLoc.startTag.line + line;
      let trueCol = character;
      if (line === 0) {
        trueCol +=
          grammarLoc.startTag.col +
          (grammarLoc.startTag.endOffset - grammarLoc.startTag.startOffset);
      } else {
        trueCol += 1;
      }
      return { line: trueLine, column: trueCol };
    }

    for (let [name, { production, rhses }] of productions) {
      let originalRhses = actualGrammarProductions.get(name)?.rhses;
      if (originalRhses === undefined) {
        let { line, column } = getLocationInGrammar(production.pos);
        lintingErrors.push({
          line,
          column,
          message: `Could not find a definition for LHS in ${type}`,
        });
        continue;
      }
      for (let rhs of rhses) {
        if (!originalRhses.some(o => rhsMatches(rhs, o))) {
          let { line, column } = getLocationInGrammar(rhs.pos);
          lintingErrors.push({
            line,
            column,
            message: `Could not find a production matching RHS in ${type}`,
          });
        }

        if (rhs.kind === SyntaxKind.RightHandSide) {
          (function noGrammarRestrictions(s: SymbolSpan | undefined) {
            if (s === undefined) {
              return;
            }
            if (s.symbol.kind === SyntaxKind.NoSymbolHereAssertion) {
              let { line, column } = getLocationInGrammar(s.symbol.pos);
              lintingErrors.push({
                line,
                column,
                message: `Productions referenced in ${type}s should not include "no LineTerminator here" restrictions`,
              });
            }
            // We could also enforce that lookahead restrictions are absent, but in some cases they actually do add clarity, so we just don't enforce it either way.

            noGrammarRestrictions(s.next);
          })(rhs.head);

          if (rhs.constraints !== undefined) {
            let { line, column } = getLocationInGrammar(rhs.constraints.pos);
            lintingErrors.push({
              line,
              column,
              message: `Productions referenced in ${type}s should not be gated on grammar parameters`,
            });
          }
        }
      }

      // Filter out unused parameter errors for which the parameter is actually used in an SDO or Early Error
      if (unusedParameterErrors.has(name)) {
        let paramToError = unusedParameterErrors.get(name)!;
        for (let [paramName, error] of paramToError) {
          // This isn't the most elegant check, but it works.
          if (rulesEles.some(r => r.innerHTML.indexOf('[' + paramName + ']') !== -1)) {
            paramToError.delete(paramName);
            // Yes, there's definitely big-O faster ways of doing this, but in practice this is probably faster for the sizes we will encounter.
            lintingErrors = lintingErrors.filter(e => e !== error);
          }
        }
      }
    }
  }

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
      let trueLine = location.startTag.line + line - 1; // both jsdom and ecmarkdown have 1-based line numbers, so if we just add we are off by one
      let trueCol = column;
      if (line === 0) {
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
    let node = grammarNodes[name];
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
