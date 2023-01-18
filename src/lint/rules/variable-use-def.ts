import type {
  FragmentNode,
  OrderedListNode,
  UnorderedListNode,
  TextNode,
  UnderscoreNode,
} from 'ecmarkdown';
import type { Reporter } from '../algorithm-error-reporter-type';

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
  declare report: Reporter;
  constructor(report: Reporter) {
    this.vars = new Map();
    // TODO remove this when regex state objects become less dumb
    for (const name of ['captures', 'input', 'startIndex', 'endIndex']) {
      this.declare(name, null);
    }
    this.report = report;
  }

  declared(name: string): boolean {
    return this.vars.has(name);
  }

  // only call this for variables previously checked to be declared
  used(name: string): boolean {
    return this.vars.get(name)!.used;
  }

  declare(name: string, nameNode: HasLocation | null, kind: VarKind = 'variable'): void {
    if (this.declared(name)) {
      return;
    }
    this.vars.set(name, { kind, used: false, node: nameNode });
  }

  undeclare(name: string) {
    this.vars.delete(name);
  }

  use(use: VariableNode) {
    const name = use.contents[0].contents;
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

type VariableNode = UnderscoreNode & { contents: [TextNode] };
export function checkVariableUsage(
  containingAlgorithm: Element,
  steps: OrderedListNode,
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
        scope.declare(name[1], null);
      }
    }
    preceding = previousOrParent(preceding, parentClause);
  }

  walkAlgorithm(steps, scope, report);

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

function walkAlgorithm(steps: OrderedListNode | UnorderedListNode, scope: Scope, report: Reporter) {
  for (const step of steps.contents) {
    const parts = step.contents;
    const loopVars: Set<VariableNode> = new Set();
    const declaredThisLine: Set<VariableNode> = new Set();

    let firstRealIndex = 0;
    let first = parts[firstRealIndex];
    while (['comment', 'tag', 'opaqueTag'].includes(first.name)) {
      ++firstRealIndex;
      first = parts[firstRealIndex];
    }

    let lastRealIndex = parts.length - 1;
    let last = parts[lastRealIndex];
    while (['comment', 'tag', 'opaqueTag'].includes(last.name)) {
      --lastRealIndex;
      last = parts[lastRealIndex];
    }

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
          scope.declare(name, { location: { start: { line, column } } }, 'attribute declaration');
        }
      }
    }

    // handle loops
    if (first.name === 'text' && first.contents.startsWith('For each ')) {
      let loopVar = parts[firstRealIndex + 1];
      if (loopVar?.name === 'pipe') {
        loopVar = parts[firstRealIndex + 3]; // 2 is the space
      }
      if (isVariable(loopVar)) {
        loopVars.add(loopVar);

        scope.declare(loopVar.contents[0].contents, loopVar, 'loop variable');
      }
    }

    // handle abstract closures
    if (
      last.name === 'text' &&
      / performs the following steps (atomically )?when called:$/.test(last.contents)
    ) {
      if (
        first.name === 'text' &&
        first.contents === 'Let ' &&
        isVariable(parts[firstRealIndex + 1])
      ) {
        const closureName = parts[firstRealIndex + 1] as VariableNode;
        scope.declare(closureName.contents[0].contents, closureName);
      }
      // everything in an AC needs to be captured explicitly
      const acScope = new Scope(report);
      let paramsIndex = parts.findIndex(
        p => p.name === 'text' && p.contents.endsWith(' with parameters (')
      );
      if (paramsIndex !== -1) {
        for (
          ;
          paramsIndex < parts.length &&
          !(
            parts[paramsIndex].name === 'text' &&
            (parts[paramsIndex].contents as string).includes(')')
          );
          ++paramsIndex
        ) {
          const v = parts[paramsIndex];
          if (isVariable(v)) {
            acScope.declare(v.contents[0].contents, v, 'abstract closure parameter');
          }
        }
      }
      let capturesIndex = parts.findIndex(
        p => p.name === 'text' && p.contents.endsWith(' that captures ')
      );

      if (capturesIndex !== -1) {
        for (; capturesIndex < parts.length; ++capturesIndex) {
          const v = parts[capturesIndex];
          if (v.name === 'text' && v.contents.includes(' and performs ')) {
            break;
          }
          if (isVariable(v)) {
            const name = v.contents[0].contents;
            scope.use(v);
            acScope.declare(name, v, 'abstract closure capture');
          }
        }
      }

      // we have a lint rule elsewhere which checks there are substeps for closures, but we can't guarantee that rule hasn't tripped this run, so we still need to guard
      if (step.sublist != null && step.sublist.name === 'ol') {
        walkAlgorithm(step.sublist, acScope, report);
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
    for (let i = 1; i < parts.length; ++i) {
      const part = parts[i];
      if (isVariable(part) && !loopVars.has(part)) {
        const varName = part.contents[0].contents;

        // check for "there exists"
        const prev = parts[i - 1];
        if (
          prev.name === 'text' &&
          // prettier-ignore
          /\b(?:for any |for some |there exists |there is |there does not exist )(\w+ )*$/.test(prev.contents)
        ) {
          scope.declare(varName, part);
          declaredThisLine.add(part);
          continue;
        }

        // check for "Let _x_ be" / "_x_ and _y_ such that"
        if (i < parts.length - 1) {
          const next = parts[i + 1];
          const isSuchThat = next.name === 'text' && next.contents.startsWith(' such that ');
          const isBe = next.name === 'text' && next.contents.startsWith(' be ');

          if (isSuchThat || isBe) {
            const varsDeclaredHere = [part];
            let varIndex = i - 1;
            // walk backwards collecting this list of variables separated by comma/'and'
            for (; varIndex >= 1; varIndex -= 2) {
              if (parts[varIndex].name !== 'text') {
                break;
              }
              const sep = parts[varIndex].contents as string;
              if (![', ', ', and ', ' and '].includes(sep)) {
                break;
              }
              const prev = parts[varIndex - 1];
              if (!isVariable(prev)) {
                break;
              }
              varsDeclaredHere.push(prev);
            }

            const cur = parts[varIndex];
            if (
              // "of"/"in" guard is to distinguish "an integer X such that" from "an integer X in Y such that" - latter should not declare Y
              (isSuchThat && cur.name === 'text' && !/(?: of | in )/.test(cur.contents)) ||
              (isBe && cur.name === 'text' && /\blet (?:each of )?$/i.test(cur.contents))
            ) {
              for (const v of varsDeclaredHere) {
                scope.declare(v.contents[0].contents, v);
                declaredThisLine.add(v);
              }
            }
            continue;
          }
        }
      }
    }

    // handle uses
    for (let i = 0; i < parts.length; ++i) {
      const part = parts[i];
      if (isVariable(part) && !loopVars.has(part) && !declaredThisLine.has(part)) {
        scope.use(part);
      }
    }

    if (step.sublist != null) {
      walkAlgorithm(step.sublist, scope, report);
    }

    for (const decl of loopVars) {
      scope.undeclare(decl.contents[0].contents);
    }
  }
}

function isVariable(node: FragmentNode | null): node is VariableNode {
  if (node == null) {
    return false;
  }
  return (
    node.name === 'underscore' && node.contents.length === 1 && node.contents[0].name === 'text'
  );
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
