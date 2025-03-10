import type {
  Production,
  ProductionBody,
  RightHandSide,
  OneOfList,
  SymbolSpan,
  LexicalSymbol,
  Terminal,
  Nonterminal,
  ButNotSymbol,
  OneOfSymbol,
  ArgumentList,
  SourceFile,
  Grammar as GrammarFile,
} from 'grammarkdown';
import type { Node as EcmarkdownNode } from 'ecmarkdown';

import { SyntaxKind, skipTrivia, NodeVisitor } from 'grammarkdown';
import * as emd from 'ecmarkdown';

export function getProductions(sourceFiles: readonly SourceFile[]) {
  const productions: Map<string, { production: Production; rhses: (RightHandSide | OneOfList)[] }> =
    new Map();
  sourceFiles.forEach(f =>
    f.elements.forEach(e => {
      if (e.kind !== SyntaxKind.Production) {
        // The alternatives supported by Grammarkdown are imports and defines, which ecma-262 does not use.
        throw new Error('Grammar contains non-production node ' + JSON.stringify(e));
      }
      if (typeof e.body === 'undefined') {
        throw new Error('production lacks body ' + JSON.stringify(e));
      }
      if (!productions.has(e.name.text!)) {
        productions.set(e.name.text!, { production: e, rhses: [] });
      }
      productions.get(e.name.text!)!.rhses.push(...productionBodies(e.body));
    }),
  );
  return productions;
}

function productionBodies(body: ProductionBody) {
  switch (body.kind) {
    case SyntaxKind.RightHandSideList:
      return body.elements!;
    case SyntaxKind.OneOfList:
    case SyntaxKind.RightHandSide:
      return [body];
    default:
      // @ts-expect-error
      throw new Error('unknown production body type ' + body.constructor.name);
  }
}

// these "matches" functions are not symmetric:
// the first parameter is permitted to omit flags and _opt nodes present on the second, but not conversely
export function rhsMatches(a: RightHandSide | OneOfList, b: RightHandSide | OneOfList) {
  if (a.kind !== b.kind) {
    return false;
  }
  switch (a.kind) {
    case SyntaxKind.RightHandSide: {
      const aHead = a.head;
      const bHead = (b as RightHandSide).head;
      if (aHead === undefined || bHead === undefined) {
        throw new Error('RHS must have content');
      }
      if (aHead.symbol.kind === SyntaxKind.EmptyAssertion) {
        if (aHead.next !== undefined) {
          throw new Error('empty assertions should not have other content');
        }
        return bHead.symbol.kind === SyntaxKind.EmptyAssertion || canBeEmpty(bHead);
      }
      return symbolSpanMatches(aHead, bHead);
    }
    case SyntaxKind.OneOfList:
      return oneOfListMatches(a, b as OneOfList);
  }
}

function symbolSpanMatches(a: SymbolSpan | undefined, b: SymbolSpan | undefined): boolean {
  if (a === undefined) {
    return canBeEmpty(b);
  }

  if (a !== undefined && b !== undefined && symbolMatches(a.symbol, b.symbol)) {
    return symbolSpanMatches(a.next, b.next);
  }

  // sometimes when there is an optional terminal or nonterminal we give distinct implementations for each case, rather than one implementation which represents both
  // which means both `a b c` and `a c` must match `a b? c`
  // TODO reconsider whether ECMA-262 should have these
  if (b !== undefined && canSkipSymbol(b.symbol)) {
    return symbolSpanMatches(a, b.next);
  }

  return false;
}

function canBeEmpty(b: SymbolSpan | undefined): boolean {
  return b === undefined || (canSkipSymbol(b.symbol) && canBeEmpty(b.next));
}

function canSkipSymbol(a: LexicalSymbol) {
  return (
    a.kind === SyntaxKind.NoSymbolHereAssertion ||
    a.kind === SyntaxKind.LookaheadAssertion ||
    a.kind === SyntaxKind.ProseAssertion ||
    (a as Terminal | Nonterminal).questionToken !== undefined
  );
}

function symbolMatches(a: LexicalSymbol, b: LexicalSymbol): boolean {
  if (a.kind !== b.kind) {
    return false;
  }
  switch (a.kind) {
    case SyntaxKind.Terminal:
      return a.literal.text === (b as Terminal).literal.text;
    case SyntaxKind.Nonterminal:
      if (a.argumentList !== undefined) {
        if ((b as Nonterminal).argumentList === undefined) {
          return false;
        }
        if (!argumentListMatches(a.argumentList, (b as Nonterminal).argumentList!)) {
          return false;
        }
      }
      return a.name.text === (b as Nonterminal).name.text;
    case SyntaxKind.ButNotSymbol:
      if (a.right === undefined || (b as ButNotSymbol).right === undefined) {
        throw new Error('"but not" production cannot be empty');
      }
      return (
        symbolMatches(a.left, (b as ButNotSymbol).left) &&
        symbolMatches(a.right, (b as ButNotSymbol).right!)
      );
    case SyntaxKind.EmptyAssertion:
    case SyntaxKind.LookaheadAssertion:
    case SyntaxKind.ProseAssertion:
      return true;
    case SyntaxKind.OneOfSymbol:
      if (a.symbols === undefined || (b as OneOfSymbol).symbols === undefined) {
        throw new Error('"one of" production cannot be empty');
      }
      return (
        a.symbols.length === (b as OneOfSymbol).symbols!.length &&
        a.symbols.every((s, i) => symbolMatches(s, (b as OneOfSymbol).symbols![i]))
      );
    default:
      throw new Error('unknown symbol type ' + a.constructor.name);
  }
}

function argumentListMatches(a: ArgumentList, b: ArgumentList) {
  if (a.elements === undefined || b.elements === undefined) {
    throw new Error('argument lists must have elements');
  }
  return (
    a.elements.length === b.elements.length &&
    a.elements.every((ae, i) => {
      const be = b.elements![i];
      if (ae.operatorToken === undefined || be.operatorToken === undefined) {
        throw new Error('arguments must have operators');
      }
      if (ae.name === undefined || be.name === undefined) {
        throw new Error('arguments must have names');
      }
      return ae.operatorToken.kind === be.operatorToken.kind && ae.name.text === be.name.text;
    })
  );
}

function oneOfListMatches(a: OneOfList, b: OneOfList) {
  if (a.terminals === undefined || b.terminals === undefined) {
    throw new Error('OneOfList must have terminals');
  }
  return (
    a.terminals.length === b.terminals.length &&
    a.terminals.every((ae, i) => ae.text === b.terminals![i].text)
  );
}

// this is only for use with single-file grammars
export function getLocationInGrammarFile(file: SourceFile, pos: number) {
  const posWithoutWhitespace = skipTrivia(file.text, pos, file.text.length);
  const { line: gmdLine, character: gmdCharacter } = file.lineMap.positionAt(posWithoutWhitespace);
  // grammarkdown use 0-based line and column, we want 1-based
  return { line: gmdLine + 1, column: gmdCharacter + 1 };
}

class CollectNonterminalsFromGrammar extends NodeVisitor {
  declare grammar: GrammarFile;
  declare results: { name: string; loc: { line: number; column: number } }[];
  constructor(grammar: GrammarFile) {
    super();
    this.grammar = grammar;
    this.results = [];
  }
  visitProduction(node: Production): Production {
    this.results.push({
      name: node.name.text!,
      loc: getLocationInGrammarFile(this.grammar.sourceFiles[0], node.name.pos),
    });
    return super.visitProduction(node);
  }

  visitNonterminal(node: Nonterminal): Nonterminal {
    this.results.push({
      name: node.name.text!,
      loc: getLocationInGrammarFile(this.grammar.sourceFiles[0], node.name.pos),
    });
    return super.visitNonterminal(node);
  }
}

export function collectNonterminalsFromGrammar(grammar: GrammarFile) {
  const visitor = new CollectNonterminalsFromGrammar(grammar);
  grammar.rootFiles.forEach(f => {
    visitor.visitEach(f.elements);
  });
  return visitor.results;
}

export function collectNonterminalsFromEmd(
  emdNode: EcmarkdownNode | EcmarkdownNode[],
): { name: string; loc: { line: number; column: number } }[] {
  if (Array.isArray(emdNode)) {
    return emdNode.flatMap(collectNonterminalsFromEmd);
  }
  const results: ReturnType<typeof collectNonterminalsFromEmd> = [];
  emd.visit(emdNode, {
    enter(emdNode: EcmarkdownNode) {
      if (emdNode.name === 'pipe') {
        results.push({
          name: emdNode.nonTerminal,
          loc: {
            line: emdNode.location.start.line,
            column: emdNode.location.start.column + 1, // skip the pipe
          },
        });
      }
    },
  });
  return results;
}
