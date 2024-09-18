import type { OrderedListNode } from 'ecmarkdown';
import type { AlgorithmElementWithTree } from './Algorithm';
import type { AlgorithmBiblioEntry, Type as BiblioType } from './Biblio';
import type Spec from './Spec';
import type { Expr, PathItem, Seq } from './expr-parser';
import { walk as walkExpr, parse as parseExpr, isProsePart } from './expr-parser';
import { offsetToLineAndColumn, zip } from './utils';
import {
  typeFromExpr,
  typeFromExprType,
  meet,
  serialize,
  dominates,
  stripWhitespace,
} from './type-logic';

type OnlyPerformedMap = Map<string, null | 'only performed' | 'top'>;
type AlwaysAssertedToBeNormalMap = Map<string, null | 'always asserted normal' | 'top'>;

const getExpressionVisitor =
  (
    spec: Spec,
    warn: (offset: number, message: string) => void,
    onlyPerformed: OnlyPerformedMap,
    alwaysAssertedToBeNormal: AlwaysAssertedToBeNormalMap,
  ) =>
  (expr: Expr, path: PathItem[]) => {
    if (expr.name !== 'call' && expr.name !== 'sdo-call') {
      return;
    }

    const { callee, arguments: args } = expr;
    if (!(callee.length === 1 && callee[0].name === 'text')) {
      return;
    }
    const calleeName = callee[0].contents;

    const biblioEntry = spec.biblio.byAoid(calleeName);
    if (biblioEntry == null) {
      if (!['toUppercase', 'toLowercase'].includes(calleeName)) {
        // TODO make the spec not do this
        warn(callee[0].location.start.offset, `could not find definition for ${calleeName}`);
      }
      return;
    }

    if (biblioEntry.kind === 'syntax-directed operation' && expr.name === 'call') {
      warn(
        callee[0].location.start.offset,
        `${calleeName} is a syntax-directed operation and should not be invoked like a regular call`,
      );
    } else if (
      biblioEntry.kind != null &&
      biblioEntry.kind !== 'syntax-directed operation' &&
      expr.name === 'sdo-call'
    ) {
      warn(
        callee[0].location.start.offset,
        `${calleeName} is not a syntax-directed operation but here is being invoked as one`,
      );
    }

    if (biblioEntry.signature == null) {
      return;
    }
    const { signature } = biblioEntry;
    const min = signature.parameters.length;
    const max = min + signature.optionalParameters.length;
    if (args.length < min || args.length > max) {
      const count = `${min}${min === max ? '' : `-${max}`}`;
      const message = `${calleeName} takes ${count} argument${count === '1' ? '' : 's'}, but this invocation passes ${args.length}`;
      warn(callee[0].location.start.offset, message);
    } else {
      const params = signature.parameters.concat(signature.optionalParameters);
      for (const [arg, param] of zip(args, params, true)) {
        if (param.type == null) continue;
        const argType = typeFromExpr(arg, spec.biblio);
        const paramType = typeFromExprType(param.type);

        // often we can't infer the argument precisely, so we check only that the intersection is nonempty rather than that the argument type is a subtype of the parameter type
        const intersection = meet(argType, paramType);

        if (
          intersection.kind === 'never' ||
          (intersection.kind === 'list' &&
            intersection.of.kind === 'never' &&
            // if the meet is list<never>, and we're passing a concrete list, it had better be empty
            argType.kind === 'list' &&
            argType.of.kind !== 'never')
        ) {
          const argDescriptor =
            argType.kind.startsWith('concrete') ||
            argType.kind === 'enum value' ||
            argType.kind === 'null' ||
            argType.kind === 'undefined'
              ? `(${serialize(argType)})`
              : `type (${serialize(argType)})`;

          let hint = '';
          if (argType.kind === 'concrete number' && dominates({ kind: 'real' }, paramType)) {
            hint =
              '\nhint: you passed an ES language Number, but this position takes a mathematical value';
          } else if (argType.kind === 'concrete real' && dominates({ kind: 'number' }, paramType)) {
            hint =
              '\nhint: you passed a mathematical value, but this position takes an ES language Number';
          } else if (argType.kind === 'concrete real' && dominates({ kind: 'bigint' }, paramType)) {
            hint =
              '\nhint: you passed a mathematical value, but this position takes an ES language BigInt';
          }

          const items = stripWhitespace(arg.items);
          warn(
            items[0].location.start.offset,
            `argument ${argDescriptor} does not look plausibly assignable to parameter type (${serialize(paramType)})${hint}`,
          );
        }
      }
    }

    const { return: returnType } = signature;
    if (returnType == null) {
      return;
    }

    const consumedAsCompletion = isConsumedAsCompletion(expr, path);

    // checks elsewhere ensure that well-formed documents never have a union of completion and non-completion, so checking the first child suffices
    // TODO: this is for 'a break completion or a throw completion', which is kind of a silly union; maybe address that in some other way?
    const isCompletion =
      returnType.kind === 'completion' ||
      (returnType.kind === 'union' && returnType.types[0].kind === 'completion');
    if (
      ['Completion', 'ThrowCompletion', 'NormalCompletion', 'ReturnCompletion'].includes(calleeName)
    ) {
      if (consumedAsCompletion) {
        warn(
          callee[0].location.start.offset,
          `${calleeName} clearly creates a Completion Record; it does not need to be marked as such, and it would not be useful to immediately unwrap its result`,
        );
      }
    } else if (isCompletion && !consumedAsCompletion) {
      warn(
        callee[0].location.start.offset,
        `${calleeName} returns a Completion Record, but is not consumed as if it does`,
      );
    } else if (!isCompletion && consumedAsCompletion) {
      warn(
        callee[0].location.start.offset,
        `${calleeName} does not return a Completion Record, but is consumed as if it does`,
      );
    }
    if (returnType.kind === 'unused' && !isCalledAsPerform(expr, path, false)) {
      warn(
        callee[0].location.start.offset,
        `${calleeName} does not return a meaningful value and should only be invoked as \`Perform ${calleeName}(...).\``,
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

export function typecheck(spec: Spec) {
  const isUnused = (t: BiblioType) =>
    t.kind === 'unused' ||
    (t.kind === 'completion' &&
      (t.completionType === 'abrupt' || t.typeOfValueIfNormal?.kind === 'unused'));
  const AOs = spec.biblio
    .localEntries()
    .filter(e => e.type === 'op' && e.signature?.return != null) as AlgorithmBiblioEntry[];
  const onlyPerformed: OnlyPerformedMap = new Map(
    AOs.filter(e => !isUnused(e.signature!.return!)).map(a => [a.aoid, null]),
  );
  const alwaysAssertedToBeNormal: AlwaysAssertedToBeNormalMap = new Map(
    // prettier-ignore
    AOs
      .filter(e => e.signature!.return!.kind === 'completion' && !e.skipGlobalChecks)
      .map(a => [a.aoid, null]),
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
    const warn = (offset: number, message: string) => {
      const { line, column } = offsetToLineAndColumn(originalHtml, offset);
      spec.warn({
        type: 'contents',
        ruleId: 'typecheck',
        message,
        node,
        nodeRelativeLine: line,
        nodeRelativeColumn: column,
      });
    };

    const walkLines = (list: OrderedListNode) => {
      for (const line of list.contents) {
        // we already parsed in collect-algorithm-diagnostics, but that was before generating the biblio
        // the biblio affects the parse of calls, so we need to re-do it
        // TODO do collect-algorithm-diagnostics after generating the biblio, somehow?
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
          walkExpr(getExpressionVisitor(spec, warn, onlyPerformed, alwaysAssertedToBeNormal), item);
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
        i => i === pointer || i.name === 'tag' || (i.name === 'text' && /^\s*$/.test(i.contents)),
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
  let text = null;
  let prev;
  while (isProsePart((prev = seq.items[prevIndex]))) {
    if (prev.name === 'text') {
      text = prev.contents + (text ?? '');
      --prevIndex;
    } else if (prev.name === 'tag') {
      --prevIndex;
    } else {
      break;
    }
  }
  return text;
}
