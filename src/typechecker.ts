import type { OrderedListNode } from 'ecmarkdown';
import type { AlgorithmElementWithTree } from './Algorithm';
import type Biblio from './Biblio';
import type { AlgorithmBiblioEntry, Type as BiblioType } from './Biblio';
import type Spec from './Spec';
import type { BareText, Expr, NonSeq, PathItem, Seq } from './expr-parser';
import { walk as walkExpr, parse as parseExpr, isProsePart } from './expr-parser';
import { offsetToLineAndColumn, zip } from './utils';
import {
  typeFromExpr,
  typeFromExprType,
  meet,
  serialize,
  dominates,
  stripWhitespace,
  type Type,
  isCompletion,
  isPossiblyAbruptCompletion,
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
        const argType = typeFromExpr(arg, spec.biblio, warn);
        const paramType = typeFromExprType(param.type);

        const error = getErrorForUsingTypeXAsTypeY(argType, paramType);
        if (error != null) {
          let hint: string;
          switch (error) {
            case 'number-to-real': {
              hint =
                '\nhint: you passed an ES language Number, but this position takes a mathematical value';
              break;
            }
            case 'bigint-to-real': {
              hint =
                '\nhint: you passed an ES language BigInt, but this position takes a mathematical value';
              break;
            }
            case 'real-to-number': {
              hint =
                '\nhint: you passed a mathematical value, but this position takes an ES language Number';
              break;
            }
            case 'real-to-bigint': {
              hint =
                '\nhint: you passed a mathematical value, but this position takes an ES language BigInt';
              break;
            }
            case 'other': {
              hint = '';
              break;
            }
          }

          const argDescriptor =
            argType.kind.startsWith('concrete') ||
            argType.kind === 'enum value' ||
            argType.kind === 'null' ||
            argType.kind === 'undefined'
              ? `(${serialize(argType)})`
              : `type (${serialize(argType)})`;

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

type ErrorForUsingTypeXAsTypeY =
  | null // i.e., no error
  | 'number-to-real'
  | 'bigint-to-real'
  | 'real-to-number'
  | 'real-to-bigint'
  | 'other';
function getErrorForUsingTypeXAsTypeY(argType: Type, paramType: Type): ErrorForUsingTypeXAsTypeY {
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
    if (argType.kind === 'concrete number' && dominates({ kind: 'real' }, paramType)) {
      return 'number-to-real';
    } else if (argType.kind === 'concrete bigint' && dominates({ kind: 'real' }, paramType)) {
      return 'bigint-to-real';
    } else if (argType.kind === 'concrete real' && dominates({ kind: 'number' }, paramType)) {
      return 'real-to-number';
    } else if (argType.kind === 'concrete real' && dominates({ kind: 'bigint' }, paramType)) {
      return 'real-to-bigint';
    }

    return 'other';
  }
  return null;
}

export function typecheck(spec: Spec) {
  const isUnused = (t: BiblioType) =>
    t.kind === 'unused' ||
    (t.kind === 'completion' &&
      (t.completionType === 'abrupt' || t.typeOfValueIfNormal?.kind === 'unused'));
  const AOs = spec.biblio
    .localEntries()
    .filter(e => e.type === 'op' && e.signature?.return != null) as AlgorithmBiblioEntry[];
  const onlyPerformed: OnlyPerformedMap = new Map(
    AOs.filter(e => !e.skipGlobalChecks && !isUnused(e.signature!.return!)).map(a => [
      a.aoid,
      null,
    ]),
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

    let containingClause: Element | null = node;
    while (containingClause?.nodeName != null && containingClause.nodeName !== 'EMU-CLAUSE') {
      containingClause = containingClause.parentElement;
    }
    const aoid = containingClause?.getAttribute('aoid');
    const biblioEntry = aoid == null ? null : spec.biblio.byAoid(aoid);
    const signature = biblioEntry?.signature;

    // hasPossibleCompletionReturn is a three-state: null to indicate we're not looking, or a boolean
    let hasPossibleCompletionReturn =
      signature?.return == null ||
      ['sdo', 'internal method', 'concrete method'].includes(
        containingClause!.getAttribute('type')!,
      )
        ? null
        : false;
    const returnType = signature?.return == null ? null : typeFromExprType(signature.return);
    let numberOfAbstractClosuresWeAreWithin = 0;
    let hadReturnIssue = false;
    const walkLines = (list: OrderedListNode) => {
      for (const line of list.contents) {
        let thisLineIsAbstractClosure = false;
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
          if (returnType != null) {
            let idx = item.items.length - 1;
            let last: NonSeq | undefined;
            while (
              idx >= 0 &&
              ((last = item.items[idx]).name !== 'text' ||
                (last as BareText).contents.trim() === '')
            ) {
              --idx;
            }
            if (
              last != null &&
              (last as BareText).contents.endsWith('performs the following steps when called:')
            ) {
              thisLineIsAbstractClosure = true;
              ++numberOfAbstractClosuresWeAreWithin;
            } else if (numberOfAbstractClosuresWeAreWithin === 0) {
              const returnWarn = biblioEntry?._skipReturnChecks
                ? () => {
                    hadReturnIssue = true;
                  }
                : warn;
              const lineHadCompletionReturn = inspectReturns(
                returnWarn,
                item,
                returnType,
                spec.biblio,
              );
              if (hasPossibleCompletionReturn != null) {
                if (lineHadCompletionReturn == null) {
                  hasPossibleCompletionReturn = null;
                } else {
                  hasPossibleCompletionReturn ||= lineHadCompletionReturn;
                }
              }
            }
          }
        }
        if (line.sublist?.name === 'ol') {
          walkLines(line.sublist);
        }
        if (thisLineIsAbstractClosure) {
          --numberOfAbstractClosuresWeAreWithin;
        }
      }
    };
    walkLines(tree.contents);

    if (
      returnType != null &&
      isPossiblyAbruptCompletion(returnType) &&
      hasPossibleCompletionReturn === false
    ) {
      if (biblioEntry!._skipReturnChecks) {
        hadReturnIssue = true;
      } else {
        spec.warn({
          type: 'node',
          ruleId: 'completion-algorithm-lacks-completiony-thing',
          message:
            'this algorithm is declared as returning an abrupt completion, but there is no step which might plausibly return an abrupt completion',
          node,
        });
      }
    }

    if (biblioEntry?._skipReturnChecks && !hadReturnIssue) {
      spec.warn({
        type: 'node',
        ruleId: 'unnecessary-attribute',
        message:
          'this algorithm has the "skip return check" attribute, but there is nothing which would cause an issue if it were removed',
        node,
      });
    }
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

// returns a boolean to indicate whether this line can return an abrupt completion, or null to indicate we should stop caring
// also checks return types in general
function inspectReturns(
  warn: (offset: number, message: string) => void,
  line: Seq,
  returnType: Type,
  biblio: Biblio,
): boolean | null {
  let hadAbrupt = false;
  // check for `throw` etc
  const throwRegexp =
    /\b(ReturnIfAbrupt\b|IfAbruptCloseIterator\b|(^|(?<=, ))[tT]hrow (a\b|the\b|$)|[rR]eturn( a| a new| the)? Completion Record\b|the result of evaluating\b)|(?<=[\s(]|\b)\?\s/;
  let thrower = line.items.find(e => e.name === 'text' && throwRegexp.test(e.contents));
  let offsetOfThrow: number;
  if (thrower == null) {
    // `Throw` etc are at the top level, but the `?` macro can be nested, so we need to walk the whole line looking for it
    walkExpr(e => {
      if (thrower != null || e.name !== 'text') return;
      const qm = /((?<=[\s(])|\b|^)\?(\s|$)/.exec(e.contents);
      if (qm != null) {
        thrower = e;
        offsetOfThrow = qm.index;
      }
    }, line);
  } else {
    offsetOfThrow = throwRegexp.exec((thrower as BareText).contents)!.index;
  }
  if (thrower != null) {
    if (isPossiblyAbruptCompletion(returnType)) {
      hadAbrupt = true;
    } else {
      warn(
        thrower.location.start.offset + offsetOfThrow!,
        'this would return an abrupt completion, but the containing AO is declared not to return an abrupt completion',
      );
      return null;
    }
  }

  // check return types
  const returnIndex = line.items.findIndex(
    e => e.name === 'text' && /\b[Rr]eturn /.test(e.contents),
  );
  if (returnIndex === -1) return hadAbrupt;
  const last = line.items[line.items.length - 1];
  if (last.name !== 'text' || !/\.\s*$/.test(last.contents)) return hadAbrupt;

  const ret = line.items[returnIndex] as BareText;
  const afterRet = /\b[Rr]eturn\b/.exec(ret.contents)!.index + 6; /* 'return'.length */

  const beforePeriod = /\.\s*$/.exec(last.contents)!.index;
  let returnedExpr: Seq;

  if (ret === last) {
    returnedExpr = {
      name: 'seq',
      items: [
        {
          name: 'text',
          contents: ret.contents.slice(afterRet, beforePeriod),
          location: {
            start: { offset: ret.location.start.offset + afterRet },
            end: { offset: ret.location.end.offset - (ret.contents.length - beforePeriod) },
          },
        },
      ],
    };
  } else {
    const tweakedFirst: BareText = {
      name: 'text',
      contents: ret.contents.slice(afterRet),
      location: { start: { offset: ret.location.start.offset + afterRet }, end: ret.location.end },
    };

    const tweakedLast: BareText = {
      name: 'text',
      contents: last.contents.slice(0, beforePeriod),
      location: {
        start: last.location.start,
        end: { offset: last.location.end.offset - (last.contents.length - beforePeriod) },
      },
    };

    returnedExpr = {
      name: 'seq',
      items: [tweakedFirst, ...line.items.slice(returnIndex + 1, -1), tweakedLast],
    };
  }
  const typeOfReturnedExpr = typeFromExpr(returnedExpr, biblio, warn);
  if (hadAbrupt != null && isPossiblyAbruptCompletion(typeOfReturnedExpr)) {
    hadAbrupt = true;
  }

  let error = getErrorForUsingTypeXAsTypeY(typeOfReturnedExpr, returnType);

  if (error !== null) {
    if (isCompletion(returnType) && !isCompletion(typeOfReturnedExpr)) {
      // special case: you can return values for normal completions without wrapping
      error = getErrorForUsingTypeXAsTypeY(
        { kind: 'normal completion', of: typeOfReturnedExpr },
        returnType,
      );
      if (error == null) return hadAbrupt;
    }

    const returnDescriptor =
      typeOfReturnedExpr.kind.startsWith('concrete') ||
      typeOfReturnedExpr.kind === 'enum value' ||
      typeOfReturnedExpr.kind === 'null' ||
      typeOfReturnedExpr.kind === 'undefined'
        ? `returned value (${serialize(typeOfReturnedExpr)})`
        : `type of returned value (${serialize(typeOfReturnedExpr)})`;

    let hint: string;
    switch (error) {
      case 'number-to-real': {
        hint =
          '\nhint: you returned an ES language Number, but this algorithm returns a mathematical value';
        break;
      }
      case 'bigint-to-real': {
        hint =
          '\nhint: you returned an ES language BigInt, but this algorithm returns a mathematical value';
        break;
      }
      case 'real-to-number': {
        hint =
          '\nhint: you returned a mathematical value, but this algorithm returns an ES language Number';
        break;
      }
      case 'real-to-bigint': {
        hint =
          '\nhint: you returned a mathematical value, but this algorithm returns an ES language BigInt';
        break;
      }
      case 'other': {
        hint = '';
        break;
      }
    }

    warn(
      returnedExpr.items[0].location.start.offset +
        /^\s*/.exec((returnedExpr.items[0] as BareText).contents)![0].length,
      `${returnDescriptor} does not look plausibly assignable to algorithm's return type (${serialize(returnType)})${hint}`,
    );
    return null;
  }
  return hadAbrupt;
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
