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
} from 'grammarkdown';

import { Grammar as GrammarFile, SyntaxKind } from 'grammarkdown';

export function offsetToLineAndColumn(string: string, offset: number) {
  let lines = string.split('\n');
  let line = 0;
  let seen = 0;
  while (true) {
    if (seen + lines[line].length >= offset) {
      break;
    }
    seen += lines[line].length + 1; // +1 for the '\n'
    ++line;
  }
  let column = offset - seen;
  return { line: line + 1, column: column + 1 };
}

export function offsetWithinElementToTrueLocation(
  elementLoc: ReturnType<typeof getLocation>,
  string: string,
  offset: number
) {
  let { line: offsetLine, column: offsetColumn } = offsetToLineAndColumn(string, offset);

  // both JSDOM and our line/column are 1-based, so subtract 1 to avoid double-counting
  let line = elementLoc.startTag.line + offsetLine - 1;
  let column =
    offsetLine === 1
      ? elementLoc.startTag.col +
        (elementLoc.startTag.endOffset - elementLoc.startTag.startOffset) +
        offsetColumn -
        1
      : offsetColumn;

  return { line, column };
}

export function grammarkdownLocationToTrueLocation(
  elementLoc: ReturnType<typeof getLocation>,
  gmdLine: number,
  gmdCharacter: number
) {
  // jsdom's lines and columns are both 1-based
  // grammarkdown's lines and columns ("characters") are both 0-based
  // we want 1-based for both
  let line = elementLoc.startTag.line + gmdLine;
  let column =
    gmdLine === 0
      ? elementLoc.startTag.col +
        (elementLoc.startTag.endOffset - elementLoc.startTag.startOffset) +
        gmdCharacter
      : gmdCharacter + 1;
  return { line, column };
}

export function getLocation(dom: any, node: Element) {
  let loc = dom.nodeLocation(node);
  if (!loc || !loc.startTag || !loc.endTag) {
    throw new Error('could not find location');
  }
  return loc;
}

export function getProductions(grammar: GrammarFile) {
  let productions: Map<
    string,
    { production: Production; rhses: (RightHandSide | OneOfList)[] }
  > = new Map();
  grammar.rootFiles.forEach(f =>
    f.elements.forEach(e => {
      if (e.kind !== SyntaxKind.Production) {
        // The alternatives supported by Grammarkdown are imports and defines, which ecma-262 does not use.
        throw new Error('Grammar contains non-production node ' + JSON.stringify(e));
      }
      if (typeof e.body === 'undefined') {
        throw new Error('production lacks body ' + JSON.stringify(e));
      }
      if (!productions.has(e.name.text!)) {
        productions.set(e.name.text!, { production: e as Production, rhses: [] });
      }
      productions.get(e.name.text!)!.rhses.push(...productionBodies(e.body));
    })
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
      // @ts-ignore
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
      let aHead = a.head;
      let bHead = (b as RightHandSide).head;
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
    default:
      throw new Error('unknown rhs type ' + a.constructor.name);
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
      return a.text === (b as Terminal).text;
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
      let be = b.elements![i];
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
