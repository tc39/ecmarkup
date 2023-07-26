import type {
  OrderedListNode,
  UnorderedListNode,
  UnderscoreNode,
  OrderedListItemNode,
  TextNode,
} from 'ecmarkdown';
import type { Reporter } from '../algorithm-error-reporter-type';
import { Seq, walk as walkExpr } from '../../expr-parser';
import { offsetToLineAndColumn } from '../../utils';

/*
Ecmaspeak scope rules are a bit weird.
Variables can be declared across branches and used subsequently, as in

1. If condition, then
  1. Let _var_ be true.
1. Else,
  1. Let _var_ be false.
1. Use _var_.

So it mostly behaves like `var`-declared variables in JS.

(Exception: loop variables can't be used outside the loop.)

But for readability reasons, we don't want to allow redeclaration or shadowing.

The `Scope` class tracks names as if they are `var`-scoped, and the `strictScopes` property is
used to track names as if they are `let`-scoped, so we can warn on redeclaration.
*/

type HasLocation = { location: { start: { line: number; column: number } } };
type VarKind =
  | 'parameter'
  | 'variable'
  | 'abstract closure parameter'
  | 'abstract closure capture'
  | 'loop variable'
  | 'attribute declaration';
class Scope {
  declare vars: Map<string, { kind: VarKind; used: boolean; node: HasLocation | null }>;
  declare strictScopes: Set<string>[];
  declare report: Reporter;
  constructor(report: Reporter) {
    this.vars = new Map();
    this.strictScopes = [new Set()];
    this.report = report;

    // TODO remove this when regex state objects become less dumb
    for (const name of ['captures', 'input', 'startIndex', 'endIndex']) {
      this.declare(name, null, undefined, true);
    }
  }

  declared(name: string): boolean {
    return this.vars.has(name);
  }

  // only call this for variables previously checked to be declared
  used(name: string): boolean {
    return this.vars.get(name)!.used;
  }

  declare(
    name: string,
    nameNode: HasLocation | null,
    kind: VarKind = 'variable',
    mayBeShadowed: boolean = false
  ): void {
    if (this.declared(name)) {
      if (!mayBeShadowed) {
        for (const scope of this.strictScopes) {
          if (scope.has(name)) {
            this.report({
              ruleId: 're-declaration',
              message: `${JSON.stringify(name)} is already declared`,
              line: nameNode!.location.start.line,
              column: nameNode!.location.start.column,
            });
            return;
          }
        }
      }
    } else {
      this.vars.set(name, { kind, used: false, node: nameNode });
    }
    if (!mayBeShadowed) {
      this.strictScopes[this.strictScopes.length - 1].add(name);
    }
  }

  undeclare(name: string) {
    this.vars.delete(name);
  }

  use(use: UnderscoreNode) {
    const name = use.contents;
    if (this.declared(name)) {
      this.vars.get(name)!.used = true;
    } else {
      this.report({
        ruleId: 'use-before-def',
        message: `could not find a preceding declaration for ${JSON.stringify(name)}`,
        line: use.location.start.line,
        column: use.location.start.column,
      });
    }
  }
}

export function checkVariableUsage(
  algorithmSource: string,
  containingAlgorithm: Element,
  steps: OrderedListNode,
  parsed: Map<OrderedListItemNode, Seq>,
  report: Reporter
) {
  if (containingAlgorithm.hasAttribute('replaces-step')) {
    // TODO someday lint these by doing the rewrite (conceptually)
    return;
  }
  const scope = new Scope(report);

  let parentClause = containingAlgorithm.parentElement;
  while (parentClause != null) {
    if (parentClause.nodeName === 'EMU-CLAUSE') {
      break;
    }
    if (parentClause.nodeName === 'EMU-ANNEX') {
      // Annex B adds algorithms in a way which makes it hard to track the original
      // TODO someday lint Annex B
      return;
    }
    parentClause = parentClause.parentElement;
  }
  // we assume any name introduced earlier in the clause is fair game
  // this is a little permissive, but it's hard to find a precise rule, and that's better than being too restrictive
  let preceding = previousOrParent(containingAlgorithm, parentClause);
  while (preceding != null) {
    if (
      preceding.tagName !== 'EMU-ALG' &&
      preceding.querySelector('emu-alg') == null &&
      preceding.textContent != null
    ) {
      // `__` is for <del>_x_</del><ins>_y_</ins>, which has textContent `_x__y_`
      for (const name of preceding.textContent.matchAll(/(?<=\b|_)_([a-zA-Z0-9]+)_(?=\b|_)/g)) {
        scope.declare(name[1], null, undefined, true);
      }
    }
    preceding = previousOrParent(preceding, parentClause);
  }

  walkAlgorithm(algorithmSource, steps, parsed, scope, report);

  for (const [name, { kind, used, node }] of scope.vars) {
    if (!used && node != null && kind !== 'parameter' && kind !== 'abstract closure parameter') {
      // prettier-ignore
      const message = `${JSON.stringify(name)} is declared here, but never referred to`;
      report({
        ruleId: 'unused-declaration',
        message,
        line: node.location.start.line,
        column: node.location.start.column,
      });
    }
  }
}

function walkAlgorithm(
  algorithmSource: string,
  steps: OrderedListNode | UnorderedListNode,
  parsed: Map<OrderedListItemNode, Seq>,
  scope: Scope,
  report: Reporter
) {
  if (steps.name === 'ul') {
    // unordered lists can refer to variables, but only that
    for (const step of steps.contents) {
      const parts = step.contents;
      for (let i = 0; i < parts.length; ++i) {
        const part = parts[i];
        if (part.name === 'underscore') {
          scope.use(part);
        }
      }
      if (step.sublist != null) {
        walkAlgorithm(algorithmSource, step.sublist, parsed, scope, report);
      }
    }
    return;
  }
  scope.strictScopes.push(new Set());

  stepLoop: for (const step of steps.contents) {
    const loopVars: Set<UnderscoreNode> = new Set();
    const declaredThisLine: Set<UnderscoreNode> = new Set();

    const expr = parsed.get(step)!;
    const first = expr.items[0];
    const last = expr.items[expr.items.length - 1];

    // handle [declared="foo"] attributes
    const extraDeclarations = step.attrs.find(d => d.key === 'declared');
    if (extraDeclarations != null) {
      for (let name of extraDeclarations.value.split(',')) {
        name = name.trim();
        const line = extraDeclarations.location.start.line;
        const column =
          extraDeclarations.location.start.column +
          extraDeclarations.key.length +
          2 + // '="'
          findDeclaredAttrOffset(extraDeclarations.value, name);
        if (scope.declared(name)) {
          // prettier-ignore
          const message = `${JSON.stringify(name)} is already declared and does not need an explict annotation`;
          report({
            ruleId: 'unnecessary-declared-var',
            message,
            line,
            column,
          });
        } else {
          scope.declare(
            name,
            { location: { start: { line, column } } },
            'attribute declaration',
            true
          );
        }
      }
    }

    // handle loops
    if (first?.name === 'text' && first.contents.startsWith('For each ')) {
      let loopVar = expr.items[1];
      if (loopVar?.name === 'pipe' || loopVar?.name === 'record-spec') {
        loopVar = expr.items[3]; // 2 is the space
      }
      if (isVariable(loopVar)) {
        loopVars.add(loopVar);

        scope.declare(loopVar.contents, loopVar, 'loop variable');
      }
    }

    // handle abstract closures
    if (
      last?.name === 'text' &&
      / performs the following steps (atomically )?when called:$/.test(last.contents)
    ) {
      if (first.name === 'text' && first.contents === 'Let ' && isVariable(expr.items[1])) {
        const closureName = expr.items[1];
        scope.declare(closureName.contents, closureName);
      }
      // everything in an AC needs to be captured explicitly
      const acScope = new Scope(report);
      const paramsIndex = expr.items.findIndex(
        p => p.name === 'text' && p.contents.endsWith(' with parameters ')
      );
      if (paramsIndex !== -1 && paramsIndex < expr.items.length - 1) {
        const paramList = expr.items[paramsIndex + 1];
        if (paramList.name !== 'paren') {
          report({
            ruleId: 'bad-ac',
            message: `expected to find a parenthesized list of parameter names here`,
            ...offsetToLineAndColumn(algorithmSource, paramList.location.start.offset),
          });
          continue;
        }
        // TODO this kind of parsing should really be factored out
        for (let i = 0; i < paramList.items.length; ++i) {
          const item = paramList.items[i];
          if (i % 2 === 0) {
            if (item.name !== 'underscore') {
              report({
                ruleId: 'bad-ac',
                message: `expected to find a parameter name here`,
                ...offsetToLineAndColumn(algorithmSource, item.location.start.offset),
              });
              continue stepLoop;
            }
            acScope.declare(item.contents, item, 'abstract closure parameter');
          } else {
            if (item.name !== 'text' || item.contents !== ', ') {
              report({
                ruleId: 'bad-ac',
                message: `expected to find ", " here`,
                ...offsetToLineAndColumn(algorithmSource, item.location.start.offset),
              });
              continue stepLoop;
            }
          }
        }
      }

      let capturesIndex = expr.items.findIndex(
        p => p.name === 'text' && p.contents.endsWith(' that captures ')
      );

      if (capturesIndex !== -1) {
        for (; capturesIndex < expr.items.length; ++capturesIndex) {
          const v = expr.items[capturesIndex];
          if (v.name === 'text' && v.contents.includes(' and performs ')) {
            break;
          }
          if (isVariable(v)) {
            const name = v.contents;
            scope.use(v);
            acScope.declare(name, v, 'abstract closure capture');
          }
        }
      }

      // we have a lint rule elsewhere which checks there are substeps for closures, but we can't guarantee that rule hasn't tripped this run, so we still need to guard
      if (step.sublist != null && step.sublist.name === 'ol') {
        walkAlgorithm(algorithmSource, step.sublist, parsed, acScope, report);
        for (const [name, { node, kind, used }] of acScope.vars) {
          if (kind === 'abstract closure capture' && !used) {
            report({
              ruleId: 'unused-capture',
              message: `closure captures ${JSON.stringify(name)}, but never uses it`,
              line: node!.location.start.line,
              column: node!.location.start.column,
            });
          }
        }
      }
      continue;
    }

    // handle let/such that/there exists declarations
    for (let i = 1; i < expr.items.length; ++i) {
      const part = expr.items[i];
      if (isVariable(part) && !loopVars.has(part)) {
        const varName = part.contents;

        // check for "there exists"
        const prev = expr.items[i - 1];
        if (
          prev.name === 'text' &&
          // prettier-ignore
          /\b(?:for any |for some |there exists |there is |there does not exist )((?!of |in )(\w+ ))*$/.test(prev.contents)
        ) {
          scope.declare(varName, part);
          declaredThisLine.add(part);
          continue;
        }

        // check for "Let _x_ be" / "_x_ and _y_ such that"
        if (i < expr.items.length - 1) {
          const next = expr.items[i + 1];
          const isSuchThat = next.name === 'text' && next.contents.startsWith(' such that ');
          const isBe = next.name === 'text' && next.contents.startsWith(' be ');

          if (isSuchThat || isBe) {
            const varsDeclaredHere = [part];
            let varIndex = i - 1;
            // walk backwards collecting this list of variables separated by comma/'and'
            for (; varIndex >= 1; varIndex -= 2) {
              if (expr.items[varIndex].name !== 'text') {
                break;
              }
              const sep = (expr.items[varIndex] as TextNode).contents;
              if (![', ', ', and ', ' and '].includes(sep)) {
                break;
              }
              const prev = expr.items[varIndex - 1];
              if (!isVariable(prev)) {
                break;
              }
              varsDeclaredHere.push(prev);
            }

            const cur = expr.items[varIndex];
            if (
              // "of"/"in" guard is to distinguish "an integer X such that" from "an integer X in Y such that" - latter should not declare Y
              (isSuchThat && cur.name === 'text' && !/(?: of | in )/.test(cur.contents)) ||
              (isBe && cur.name === 'text' && /\blet (?:each of )?$/i.test(cur.contents))
            ) {
              const conditional =
                expr.items[0].name === 'text' &&
                /^(If|Else|Otherwise)\b/.test(expr.items[0].contents);

              for (const v of varsDeclaredHere) {
                scope.declare(v.contents, v, 'variable', conditional);
                declaredThisLine.add(v);
              }
            }
            continue;
          }
        }
      }
    }

    // handle uses
    walkExpr(v => {
      if (v.name === 'underscore' && !loopVars.has(v) && !declaredThisLine.has(v)) {
        scope.use(v);
      }
    }, expr);

    if (step.sublist != null) {
      walkAlgorithm(algorithmSource, step.sublist, parsed, scope, report);
    }

    for (const decl of loopVars) {
      scope.undeclare(decl.contents);
    }
  }
  scope.strictScopes.pop();
}

function isVariable(node: UnderscoreNode | { name: string } | null): node is UnderscoreNode {
  return node?.name === 'underscore';
}

function previousOrParent(element: Element, stopAt: Element | null): Element | null {
  if (element === stopAt) {
    return null;
  }
  if (element.previousElementSibling != null) {
    return element.previousElementSibling;
  }
  if (element.parentElement == null) {
    return null;
  }
  return previousOrParent(element.parentElement, stopAt);
}

function findDeclaredAttrOffset(attrSource: string, name: string) {
  const matcher = new RegExp('\\b' + name.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&') + '\\b'); // regexp.escape when
  return attrSource.match(matcher)!.index!;
}
