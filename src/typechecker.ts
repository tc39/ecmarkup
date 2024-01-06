import { OrderedListNode } from 'ecmarkdown';
import type { AlgorithmElementWithTree } from './Algorithm';
import type { AlgorithmBiblioEntry, Type } from './Biblio';
import type Spec from './Spec';
import type { Expr, PathItem } from './expr-parser';
import { walk as walkExpr, parse as parseExpr, isProsePart, Seq } from './expr-parser';
import { offsetToLineAndColumn } from './utils';

export function typecheck(spec: Spec) {
  const isUnused = (t: Type) =>
    t.kind === 'unused' ||
    (t.kind === 'completion' &&
      (t.completionType === 'abrupt' || t.typeOfValueIfNormal?.kind === 'unused'));
  const AOs = spec.biblio
    .localEntries()
    .filter(e => e.type === 'op' && e.signature?.return != null) as AlgorithmBiblioEntry[];
  const onlyPerformed: Map<string, null | 'only performed' | 'top'> = new Map(
    AOs.filter(e => !isUnused(e.signature!.return!)).map(a => [a.aoid, null])
  );
  const alwaysAssertedToBeNormal: Map<string, null | 'always asserted normal' | 'top'> = new Map(
    // prettier-ignore
    AOs
      .filter(e => e.signature!.return!.kind === 'completion' && !e.skipGlobalChecks)
      .map(a => [a.aoid, null])
  );

  // TODO strictly speaking this needs to be done in the namespace of the current algorithm
  const opNames = spec.biblio.getOpNames(spec.namespace);

  // TODO move declarations out of loop
  for (const node of spec.doc.querySelectorAll('emu-alg')) {
    if (node.hasAttribute('example') || !('ecmarkdownTree' in node)) {
      continue;
    }
    const tree = (node as AlgorithmElementWithTree).ecmarkdownTree;
    if (tree == null) {
      continue;
    }
    const originalHtml = (node as AlgorithmElementWithTree).originalHtml;

    const expressionVisitor = (expr: Expr, path: PathItem[]) => {
      if (expr.name !== 'call' && expr.name !== 'sdo-call') {
        return;
      }

      const { callee, arguments: args } = expr;
      if (!(callee.length === 1 && callee[0].name === 'text')) {
        return;
      }
      const calleeName = callee[0].contents;

      const warn = (message: string) => {
        const { line, column } = offsetToLineAndColumn(
          originalHtml,
          callee[0].location.start.offset
        );
        spec.warn({
          type: 'contents',
          ruleId: 'typecheck',
          message,
          node,
          nodeRelativeLine: line,
          nodeRelativeColumn: column,
        });
      };

      const biblioEntry = spec.biblio.byAoid(calleeName);
      if (biblioEntry == null) {
        if (!['toUppercase', 'toLowercase'].includes(calleeName)) {
          // TODO make the spec not do this
          warn(`could not find definition for ${calleeName}`);
        }
        return;
      }

      if (biblioEntry.kind === 'syntax-directed operation' && expr.name === 'call') {
        warn(
          `${calleeName} is a syntax-directed operation and should not be invoked like a regular call`
        );
      } else if (
        biblioEntry.kind != null &&
        biblioEntry.kind !== 'syntax-directed operation' &&
        expr.name === 'sdo-call'
      ) {
        warn(`${calleeName} is not a syntax-directed operation but here is being invoked as one`);
      }

      if (biblioEntry.signature == null) {
        return;
      }
      const min = biblioEntry.signature.parameters.length;
      const max = min + biblioEntry.signature.optionalParameters.length;
      if (args.length < min || args.length > max) {
        const count = `${min}${min === max ? '' : `-${max}`}`;
        // prettier-ignore
        const message = `${calleeName} takes ${count} argument${count === '1' ? '' : 's'}, but this invocation passes ${args.length}`;
        warn(message);
      }

      const { return: returnType } = biblioEntry.signature;
      if (returnType == null) {
        return;
      }

      const consumedAsCompletion = isConsumedAsCompletion(expr, path);

      // checks elsewhere ensure that well-formed documents never have a union of completion and non-completion, so checking the first child suffices
      // TODO: this is for 'a break completion or a throw completion', which is kind of a silly union; maybe address that in some other way?
      const isCompletion =
        returnType.kind === 'completion' ||
        (returnType.kind === 'union' && returnType.types[0].kind === 'completion');
      if (['Completion', 'ThrowCompletion', 'NormalCompletion'].includes(calleeName)) {
        if (consumedAsCompletion) {
          warn(
            `${calleeName} clearly creates a Completion Record; it does not need to be marked as such, and it would not be useful to immediately unwrap its result`
          );
        }
      } else if (isCompletion && !consumedAsCompletion) {
        warn(`${calleeName} returns a Completion Record, but is not consumed as if it does`);
      } else if (!isCompletion && consumedAsCompletion) {
        warn(`${calleeName} does not return a Completion Record, but is consumed as if it does`);
      }
      if (returnType.kind === 'unused' && !isCalledAsPerform(expr, path, false)) {
        warn(
          `${calleeName} does not return a meaningful value and should only be invoked as \`Perform ${calleeName}(...).\``
        );
      }

      if (onlyPerformed.has(calleeName) && onlyPerformed.get(calleeName) !== 'top') {
        const old = onlyPerformed.get(calleeName);
        const performed = isCalledAsPerform(expr, path, true);
        if (!performed) {
          onlyPerformed.set(calleeName, 'top');
        } else if (old === null) {
          onlyPerformed.set(calleeName, 'only performed');
        }
      }
      if (
        alwaysAssertedToBeNormal.has(calleeName) &&
        alwaysAssertedToBeNormal.get(calleeName) !== 'top'
      ) {
        const old = alwaysAssertedToBeNormal.get(calleeName);
        const asserted = isAssertedToBeNormal(expr, path);
        if (!asserted) {
          alwaysAssertedToBeNormal.set(calleeName, 'top');
        } else if (old === null) {
          alwaysAssertedToBeNormal.set(calleeName, 'always asserted normal');
        }
      }
    };
    const walkLines = (list: OrderedListNode) => {
      for (const line of list.contents) {
        const item = parseExpr(line.contents, opNames);
        if (item.name === 'failure') {
          const { line, column } = offsetToLineAndColumn(originalHtml, item.offset);
          spec.warn({
            type: 'contents',
            ruleId: 'expression-parsing',
            message: item.message,
            node,
            nodeRelativeLine: line,
            nodeRelativeColumn: column,
          });
        } else {
          walkExpr(expressionVisitor, item);
        }
        if (line.sublist?.name === 'ol') {
          walkLines(line.sublist);
        }
      }
    };
    walkLines(tree.contents);
  }

  for (const [aoid, state] of onlyPerformed) {
    if (state !== 'only performed') {
      continue;
    }
    const message = `${aoid} is only ever invoked with Perform, so it should return ~unused~ or a Completion Record which, if normal, contains ~unused~`;
    const ruleId = 'perform-not-unused';
    const biblioEntry = spec.biblio.byAoid(aoid)!;
    if (biblioEntry._node) {
      spec.spec.warn({
        type: 'node',
        ruleId,
        message,
        node: biblioEntry._node,
      });
    } else {
      spec.spec.warn({
        type: 'global',
        ruleId,
        message,
      });
    }
  }

  for (const [aoid, state] of alwaysAssertedToBeNormal) {
    if (state !== 'always asserted normal') {
      continue;
    }
    if (aoid === 'AsyncGeneratorAwaitReturn') {
      // TODO remove this when https://github.com/tc39/ecma262/issues/2412 is fixed
      continue;
    }
    const message = `every call site of ${aoid} asserts the return value is a normal completion; it should be refactored to not return a completion record at all. if this AO is called in ways ecmarkup cannot analyze, add the "skip global checks" attribute to the header.`;
    const ruleId = 'always-asserted-normal';
    const biblioEntry = spec.biblio.byAoid(aoid)!;
    if (biblioEntry._node) {
      spec.spec.warn({
        type: 'node',
        ruleId,
        message,
        node: biblioEntry._node,
      });
    } else {
      spec.spec.warn({
        type: 'global',
        ruleId,
        message,
      });
    }
  }
}

function isCalledAsPerform(expr: Expr, path: PathItem[], allowQuestion: boolean) {
  const prev = previousText(expr, path);
  return prev != null && (allowQuestion ? /\bperform ([?!]\s)?$/i : /\bperform $/i).test(prev);
}

function isAssertedToBeNormal(expr: Expr, path: PathItem[]) {
  const prev = previousText(expr, path);
  return prev != null && /\s!\s$/.test(prev);
}

function isConsumedAsCompletion(expr: Expr, path: PathItem[]) {
  const part = parentSkippingBlankSpace(expr, path);
  if (part == null) {
    return false;
  }
  const { parent, index } = part;
  if (parent.name === 'seq') {
    // if the previous text ends in `! ` or `? `, this is a completion
    const text = textFromPreviousPart(parent, index);
    if (text != null && /[!?]\s$/.test(text)) {
      return true;
    }
  } else if (parent.name === 'call' && index === 0 && parent.arguments.length === 1) {
    // if this is `Completion(Expr())`, this is a completion
    const parts = parent.callee;
    if (parts.length === 1 && parts[0].name === 'text' && parts[0].contents === 'Completion') {
      return true;
    }
  }
  return false;
}

function parentSkippingBlankSpace(expr: Expr, path: PathItem[]): PathItem | null {
  for (let pointer: Expr = expr, i = path.length - 1; i >= 0; pointer = path[i].parent, --i) {
    const { parent } = path[i];
    if (
      parent.name === 'seq' &&
      parent.items.every(
        i => i === pointer || i.name === 'tag' || (i.name === 'text' && /^\s*$/.test(i.contents))
      )
    ) {
      // if parent is just whitespace/tags around the call, walk up the tree further
      continue;
    }
    return path[i];
  }
  return null;
}

function previousText(expr: Expr, path: PathItem[]): string | null {
  const part = parentSkippingBlankSpace(expr, path);
  if (part == null) {
    return null;
  }
  const { parent, index } = part;
  if (parent.name === 'seq') {
    return textFromPreviousPart(parent, index);
  }
  return null;
}

function textFromPreviousPart(seq: Seq, index: number): string | null {
  let prevIndex = index - 1;
  let prev;
  while (isProsePart((prev = seq.items[prevIndex]))) {
    if (prev.name === 'text') {
      return prev.contents;
    } else if (prev.name === 'tag') {
      --prevIndex;
    } else {
      break;
    }
  }
  return null;
}
