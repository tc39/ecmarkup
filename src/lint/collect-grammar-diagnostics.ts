import type { default as Spec, Warning } from '../Spec';

import {
  Grammar as GrammarFile,
  CoreAsyncHost,
  EmitFormat,
  SyntaxKind,
  SymbolSpan,
  Diagnostics,
  Production,
  Parameter,
} from 'grammarkdown';

import { getProductions, rhsMatches, getLocationInGrammar } from './utils';

export async function collectGrammarDiagnostics(
  report: (e: Warning) => void,
  spec: Spec,
  mainSource: string,
  mainGrammar: { element: Element; source: string }[],
  sdos: { grammar: Element; alg: Element }[],
  earlyErrors: { grammar: Element; lists: HTMLUListElement[] }[]
) {
  // *******************
  // Parse the grammar with Grammarkdown and collect its diagnostics, if any

  let mainHost = new CoreAsyncHost({
    ignoreCase: false,
    useBuiltinGrammars: false,
    resolveFile: file => file,
    readFile(file: string) {
      let idx = parseInt(file);
      if (idx.toString() !== file || idx < 0 || idx >= mainGrammar.length) {
        throw new Error('tried to read non-existent ' + file);
      }
      return mainGrammar[idx].source;
    },
  });
  let compilerOptions = {
    format: EmitFormat.ecmarkup,
    noChecks: false,
    noUnusedParameters: true,
  };
  let grammar = new GrammarFile(Object.keys(mainGrammar), compilerOptions, mainHost);
  await grammar.parse();
  await grammar.check();

  let unusedParameterErrors: Map<string, Map<string, Warning>> = new Map();

  if (grammar.diagnostics.size > 0) {
    // `detailedMessage: false` prevents prepending line numbers, which is good because we're going to make our own
    grammar.diagnostics
      .getDiagnosticInfos({ formatMessage: true, detailedMessage: false })
      .forEach(m => {
        let idx = +m.sourceFile!.filename;
        let error: Warning = {
          type: 'contents',
          ruleId: `grammarkdown:${m.code}`,
          message: m.formattedMessage!,
          node: mainGrammar[idx].element,
          nodeRelativeLine: m.range!.start.line + 1,
          nodeRelativeColumn: m.range!.start.character + 1,
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
    const grammarLoc = spec.locate(grammarEle);
    if (!grammarLoc) continue;

    let { source: importSource } = grammarLoc;

    if (grammarLoc.endTag == null) {
      // we'll warn for this in collect-tag-diagnostics; no need to do so here
      continue;
    }

    let grammarHost = CoreAsyncHost.forFile(
      (importSource ?? mainSource).slice(
        grammarLoc.startTag.endOffset,
        grammarLoc.endTag.startOffset
      )
    );
    let grammar = new GrammarFile(
      [grammarHost.file],
      { format: EmitFormat.ecmarkup, noChecks: true },
      grammarHost
    );
    await grammar.parse();
    oneOffGrammars.push({ grammarEle, grammar });
    let productions = getProductions(grammar);

    for (let [name, { production, rhses }] of productions) {
      let originalRhses = actualGrammarProductions.get(name)?.rhses;
      if (originalRhses === undefined) {
        let { line, column } = getLocationInGrammar(grammar, production.pos);
        report({
          type: 'contents',
          ruleId: 'undefined-nonterminal',
          message: `Could not find a definition for LHS in ${type}`,
          node: grammarEle,
          nodeRelativeLine: line,
          nodeRelativeColumn: column,
        });
        continue;
      }
      for (let rhs of rhses) {
        if (!originalRhses.some(o => rhsMatches(rhs, o))) {
          let { line, column } = getLocationInGrammar(grammar, rhs.pos);
          report({
            type: 'contents',
            ruleId: 'undefined-nonterminal',
            message: `Could not find a production matching RHS in ${type}`,
            node: grammarEle,
            nodeRelativeLine: line,
            nodeRelativeColumn: column,
          });
        }

        if (rhs.kind === SyntaxKind.RightHandSide) {
          (function noGrammarRestrictions(s: SymbolSpan | undefined) {
            if (s === undefined) {
              return;
            }
            if (s.symbol.kind === SyntaxKind.NoSymbolHereAssertion) {
              let { line, column } = getLocationInGrammar(grammar, s.symbol.pos);
              report({
                type: 'contents',
                ruleId: `NLTH-in-SDO`,
                message: `Productions referenced in ${type}s should not include "no LineTerminator here" restrictions`,
                node: grammarEle,
                nodeRelativeLine: line,
                nodeRelativeColumn: column,
              });
            }
            // We could also enforce that lookahead restrictions are absent, but in some cases they actually do add clarity, so we just don't enforce it either way.

            noGrammarRestrictions(s.next);
          })(rhs.head);

          if (rhs.constraints !== undefined) {
            let { line, column } = getLocationInGrammar(grammar, rhs.constraints.pos);
            report({
              type: 'contents',
              ruleId: `guard-in-SDO`,
              message: `productions referenced in ${type}s should not be gated on grammar parameters`,
              node: grammarEle,
              nodeRelativeLine: line,
              nodeRelativeColumn: column,
            });
          }
        }
      }

      // Filter out unused parameter errors for which the parameter is actually used in an SDO or Early Error
      if (unusedParameterErrors.has(name)) {
        let paramToError = unusedParameterErrors.get(name)!;
        for (let paramName of paramToError.keys()) {
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
