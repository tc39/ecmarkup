import type { EcmarkupError } from '../ecmarkup';

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
  tokenToString,
} from 'grammarkdown';

import {
  getProductions,
  rhsMatches,
} from './utils';
import {  grammarkdownLocationToTrueLocation,
  getLocation,
} from '../utils'

export function collectGrammarDiagnostics(
  report: (e: EcmarkupError) => void,
  dom: any,
  sourceText: string,
  mainGrammar: { element: Element; source: string }[],
  sdos: { grammar: Element; alg: Element }[],
  earlyErrors: { grammar: Element; lists: HTMLUListElement[] }[]
) {
  // *******************
  // Parse the grammar with Grammarkdown and collect its diagnostics, if any

  let grammarParser = new GrammarParser();
  // TODO use CoreSyncHost once published
  let fakeHost: SyncHost = {
    readFileSync(file: string) {
      let idx = parseInt(file);
      if (idx.toString() !== file || idx < 0 || idx >= mainGrammar.length) {
        throw new Error('tried to read non-existent ' + file);
      }
      return mainGrammar[idx].source;
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
  let grammar = new GrammarFile(Object.keys(mainGrammar), compilerOptions, fakeHost);
  grammar.parseSync();
  grammar.checkSync();

  let lintingErrors: EcmarkupError[] = [];
  let unusedParameterErrors: Map<string, Map<string, EcmarkupError>> = new Map();

  if (grammar.diagnostics.size > 0) {
    // `detailedMessage: false` prevents prepending line numbers, which is good because we're going to make our own
    grammar.diagnostics
      .getDiagnosticInfos({ formatMessage: true, detailedMessage: false })
      .forEach(m => {
        let idx = +m.sourceFile!.filename;
        let grammarLoc = getLocation(dom, mainGrammar[idx].element);

        let { line, column } = grammarkdownLocationToTrueLocation(
          grammarLoc,
          m.range!.start.line,
          m.range!.start.character
        );

        let error = {
          ruleId: `grammarkdown:${m.code}`,
          nodeType: m.node === undefined ? 'unknown' : tokenToString(m.node.kind, false),
          line,
          column,
          message: m.formattedMessage!,
        };

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
          paramToError.set(paramName, error);
        } else {
          report(error);
        }
      });
  }

  // *******************
  // Check that SDOs and Early Errors are defined in terms of productions which actually exist
  // Also filter out any "unused parameter" warnings for grammar productions for which the parameter is used in an early error or SDO

  let oneOffGrammars: { grammarEle: Element; grammar: GrammarFile }[] = [];
  let actualGrammarProductions = getProductions(grammar);
  let grammarsAndRules = [
    ...sdos.map(s => ({ grammar: s.grammar, rules: [s.alg], type: 'syntax-directed operation' })),
    ...earlyErrors.map(e => ({ grammar: e.grammar, rules: e.lists, type: 'early error' })),
  ];
  for (let { grammar: grammarEle, rules: rulesEles, type } of grammarsAndRules) {
    const nodeType = grammarEle.tagName;
    let grammarLoc = getLocation(dom, grammarEle);

    if (grammarLoc.endTag == null) {
      report({
        ruleId: 'missing-close-tag',
        message: 'could not find closing tag for emu-grammar',
        line: grammarLoc.startTag.line,
        column: grammarLoc.startTag.col,
        nodeType: 'EMU-GRAMMAR',
      });
      continue;
    }

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
      let { line: gmdLine, character: gmdCharacter } = file.lineMap.positionAt(
        posWithoutWhitespace
      );

      return grammarkdownLocationToTrueLocation(grammarLoc, gmdLine, gmdCharacter);
    }

    for (let [name, { production, rhses }] of productions) {
      let originalRhses = actualGrammarProductions.get(name)?.rhses;
      if (originalRhses === undefined) {
        let { line, column } = getLocationInGrammar(production.pos);
        report({
          ruleId: 'undefined-nonterminal',
          nodeType,
          line,
          column,
          message: `Could not find a definition for LHS in ${type}`,
        });
        continue;
      }
      for (let rhs of rhses) {
        if (!originalRhses.some(o => rhsMatches(rhs, o))) {
          let { line, column } = getLocationInGrammar(rhs.pos);
          report({
            ruleId: 'undefined-nonterminal',
            nodeType,
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
              report({
                ruleId: `NLTH-in-SDO`,
                nodeType,
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
            report({
              ruleId: `guard-in-SDO`,
              nodeType,
              line,
              column,
              message: `productions referenced in ${type}s should not be gated on grammar parameters`,
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
          }
        }
      }
    }
  }

  for (let paramToError of unusedParameterErrors.values()) {
    for (let error of paramToError.values()) {
      report(error);
    }
  }

  return {
    grammar,
    oneOffGrammars,
  };
}
