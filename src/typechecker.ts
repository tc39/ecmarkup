import type { OrderedListNode } from 'ecmarkdown';
import type { AlgorithmElementWithTree } from './Algorithm';
import type { AlgorithmBiblioEntry, Type as BiblioType } from './Biblio';
import type Spec from './Spec';
import type { Expr, NonSeq, PathItem, Seq } from './expr-parser';
import { walk as walkExpr, parse as parseExpr, isProsePart } from './expr-parser';
import { offsetToLineAndColumn, zip } from './utils';
import type Biblio from './Biblio';

export function typecheck(spec: Spec) {
  const isUnused = (t: BiblioType) =>
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
      const { signature } = biblioEntry;
      const min = signature.parameters.length;
      const max = min + signature.optionalParameters.length;
      if (args.length < min || args.length > max) {
        const count = `${min}${min === max ? '' : `-${max}`}`;
        // prettier-ignore
        const message = `${calleeName} takes ${count} argument${count === '1' ? '' : 's'}, but this invocation passes ${args.length}`;
        warn(message);
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
            const items = stripWhitespace(arg.items);
            const { line, column } = offsetToLineAndColumn(
              originalHtml,
              items[0].location.start.offset
            );
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
                '\nhint: you passed an ES number, but this position takes a mathematical value';
            } else if (
              argType.kind === 'concrete real' &&
              dominates({ kind: 'number' }, paramType)
            ) {
              hint =
                '\nhint: you passed a real number, but this position takes an ES language Number';
            } else if (
              argType.kind === 'concrete real' &&
              dominates({ kind: 'bigint' }, paramType)
            ) {
              hint =
                '\nhint: you passed a real number, but this position takes an ES language BigInt';
            }

            spec.warn({
              type: 'contents',
              ruleId: 'typecheck',
              // prettier-ignore
              message: `argument ${argDescriptor} does not look plausibly assignable to parameter type (${serialize(paramType)})${hint}`,
              node,
              nodeRelativeLine: line,
              nodeRelativeColumn: column,
            });
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

function stripWhitespace(items: NonSeq[]) {
  items = [...items];
  while (items[0]?.name === 'text' && /^\s+$/.test(items[0].contents)) {
    items.shift();
  }
  while (
    items[items.length - 1]?.name === 'text' &&
    // @ts-expect-error
    /^\s+$/.test(items[items.length - 1].contents)
  ) {
    items.pop();
  }
  return items;
}

type Type =
  | { kind: 'unknown' } // top
  | { kind: 'never' } // bottom
  | { kind: 'union'; of: NonUnion[] } // constraint: nothing in the union dominates anything else in the union
  | { kind: 'list'; of: Type }
  | { kind: 'record' } // TODO more precision
  | { kind: 'completion'; of: Type }
  | { kind: 'real' }
  | { kind: 'integer' }
  | { kind: 'non-negative integer' }
  | { kind: 'concrete real'; value: string }
  | { kind: 'ES value' }
  | { kind: 'string' }
  | { kind: 'number' }
  | { kind: 'integral number' }
  | { kind: 'bigint' }
  | { kind: 'boolean' }
  | { kind: 'null' }
  | { kind: 'undefined' }
  | { kind: 'concrete string'; value: string }
  | { kind: 'concrete number'; value: string }
  | { kind: 'concrete bigint'; value: string }
  | { kind: 'concrete boolean'; value: boolean }
  | { kind: 'enum value'; value: string };

type NonUnion = Exclude<Type, { kind: 'union' }>;

const simpleKinds = new Set<Type['kind']>([
  'unknown',
  'never',
  'record',
  'real',
  'integer',
  'non-negative integer',
  'ES value',
  'string',
  'number',
  'integral number',
  'bigint',
  'boolean',
  'null',
  'undefined',
]);

const dominateGraph: Partial<Record<Type['kind'], Type['kind'][]>> = {
  // @ts-expect-error TS does not know about __proto__
  __proto__: null,
  record: ['completion'],
  real: ['integer', 'non-negative integer', 'concrete real'],
  integer: ['non-negative integer'],
  'ES value': [
    'string',
    'number',
    'integral number',
    'bigint',
    'boolean',
    'null',
    'undefined',
    'concrete string',
    'concrete number',
    'concrete bigint',
    'concrete boolean',
  ],
  string: ['concrete string'],
  number: ['integral number', 'concrete number'],
  bigint: ['concrete bigint'],
  boolean: ['concrete boolean'],
};

/*
The type lattice used here is very simple (aside from explicit unions).
As such we mostly only need to define the `dominates` relationship and apply trivial rules:
if `x` dominates `y`, then `join(x,y) = x` and `meet(x,y) = y`; if neither dominates the other than the join is top and the meet is bottom.
Unions/lists/completions take a little more work.
*/

function dominates(a: Type, b: Type): boolean {
  if (a.kind === 'unknown' || b.kind === 'never') {
    return true;
  }
  if (b.kind === 'union') {
    return b.of.every(t => dominates(a, t));
  }
  if (a.kind === 'union') {
    // not necessarily true for arbitrary lattices, but true for ours
    return a.of.some(t => dominates(t, b));
  }
  if (
    (a.kind === 'list' && b.kind === 'list') ||
    (a.kind === 'completion' && b.kind === 'completion')
  ) {
    return dominates(a.of, b.of);
  }
  if (simpleKinds.has(a.kind) && simpleKinds.has(b.kind) && a.kind === b.kind) {
    return true;
  }
  if (dominateGraph[a.kind]?.includes(b.kind) ?? false) {
    return true;
  }
  if (
    (a.kind === 'integer' && b.kind === 'concrete real') ||
    (a.kind === 'integral number' && b.kind === 'concrete number')
  ) {
    return !b.value.includes('.');
  }
  if (a.kind === 'non-negative integer' && b.kind === 'concrete real') {
    return !b.value.includes('.') && b.value[0] !== '-';
  }
  if (
    a.kind === b.kind &&
    [
      'concrete string',
      'concrete number',
      'concrete bigint',
      'concrete boolean',
      'enum value',
    ].includes(a.kind)
  ) {
    // @ts-expect-error TS is not quite smart enough for this
    return a.value === b.value;
  }
  return false;
}

function addToUnion(types: NonUnion[], type: NonUnion): Type {
  if (types.some(t => dominates(t, type))) {
    return { kind: 'union', of: types };
  }
  const live = types.filter(t => !dominates(type, t));
  if (live.length === 0) {
    return type;
  }
  return { kind: 'union', of: [...live, type] };
}

export function join(a: Type, b: Type): Type {
  if (dominates(a, b)) {
    return a;
  }
  if (dominates(b, a)) {
    return b;
  }
  if (b.kind === 'union') {
    [a, b] = [b, a];
  }
  if (a.kind === 'union') {
    if (b.kind === 'union') {
      return b.of.reduce(
        (acc: Type, t) => (acc.kind === 'union' ? addToUnion(acc.of, t) : join(acc, t)),
        a
      );
    }
    return addToUnion(a.of, b);
  }
  if (
    (a.kind === 'list' && b.kind === 'list') ||
    (a.kind === 'completion' && b.kind === 'completion')
  ) {
    return { kind: a.kind, of: join(a.of, b.of) };
  }
  return { kind: 'union', of: [a, b as NonUnion] };
}

export function meet(a: Type, b: Type): Type {
  if (dominates(a, b)) {
    return b;
  }
  if (dominates(b, a)) {
    return a;
  }
  if (a.kind !== 'union' && b.kind === 'union') {
    [a, b] = [b, a];
  }
  if (a.kind === 'union') {
    // union is join. meet distributes over join.
    return a.of.map(t => meet(t, b)).reduce(join);
  }
  if (
    (a.kind === 'list' && b.kind === 'list') ||
    (a.kind === 'completion' && b.kind === 'completion')
  ) {
    return { kind: a.kind, of: meet(a.of, b.of) };
  }
  return { kind: 'never' };
}

function serialize(type: Type): string {
  switch (type.kind) {
    case 'unknown': {
      return 'unknown';
    }
    case 'never': {
      return 'never';
    }
    case 'union': {
      const parts = type.of.map(serialize);
      if (parts.length > 2) {
        return parts.slice(0, -1).join(', ') + ', or ' + parts[parts.length - 1];
      }
      return parts[0] + ' or ' + parts[1];
    }
    case 'list': {
      if (type.of.kind === 'never') {
        return 'empty List';
      }
      return 'List of ' + serialize(type.of);
    }
    case 'record': {
      return 'Record';
    }
    case 'completion': {
      if (type.of.kind === 'never') {
        return 'an abrupt Completion Record';
      } else if (type.of.kind === 'unknown') {
        return 'a Completion Record';
      }
      return 'a Completion Record normally holding ' + serialize(type.of);
    }
    case 'real': {
      return 'mathematical value';
    }
    case 'integer':
    case 'non-negative integer':
    case 'null':
    case 'undefined':
    case 'string': {
      return type.kind;
    }
    case 'concrete string':
    case 'concrete bigint':
    case 'concrete real': {
      return type.value;
    }
    case 'concrete boolean': {
      return `${type.value}`;
    }
    case 'enum value': {
      return `~${type.value}~`;
    }
    case 'concrete number': {
      return `*${type.value}*<sub>𝔽</sub>`;
    }
    case 'ES value': {
      return 'ECMAScript language value';
    }
    case 'boolean': {
      return 'Boolean';
    }
    case 'number': {
      return 'Number';
    }
    case 'integral number': {
      return 'integral Number';
    }
    case 'bigint': {
      return 'BigInt';
    }
  }
}

export function typeFromExpr(expr: Expr, biblio: Biblio): Type {
  seq: if (expr.name === 'seq') {
    const items = stripWhitespace(expr.items);
    if (items.length === 1) {
      expr = items[0];
      break seq;
    }

    if (
      items.length === 2 &&
      items[0].name === 'star' &&
      items[0].contents[0].name === 'text' &&
      items[1].name === 'text'
    ) {
      switch (items[1].contents) {
        case '𝔽':
          return { kind: 'concrete number', value: items[0].contents[0].contents };
        case 'ℤ':
          return { kind: 'concrete bigint', value: items[0].contents[0].contents };
      }
    }

    if (items[0]?.name === 'text' && ['!', '?'].includes(items[0].contents.trim())) {
      const remaining = stripWhitespace(items.slice(1));
      if (remaining.length === 1 && ['call', 'sdo-call'].includes(remaining[0].name)) {
        const callType = typeFromExpr(remaining[0], biblio);
        if (callType.kind === 'completion') {
          return callType.of;
        }
      }
    }
  }

  switch (expr.name) {
    case 'text': {
      const text = expr.contents.trim();
      if (/^-?[0-9]+(\.[0-9]+)?$/.test(text)) {
        return { kind: 'concrete real', value: text };
      }
      break;
    }
    case 'list': {
      return {
        kind: 'list',
        of: expr.elements.map(t => typeFromExpr(t, biblio)).reduce(join, { kind: 'never' }),
      };
    }
    case 'record': {
      return { kind: 'record' };
    }
    case 'call':
    case 'sdo-call': {
      const { callee } = expr;
      if (!(callee.length === 1 && callee[0].name === 'text')) {
        break;
      }
      const calleeName = callee[0].contents;

      const biblioEntry = biblio.byAoid(calleeName);
      if (biblioEntry?.signature?.return == null) {
        break;
      }
      return typeFromExprType(biblioEntry.signature.return);
    }
    case 'tilde': {
      if (expr.contents.length === 1 && expr.contents[0].name === 'text') {
        return { kind: 'enum value', value: expr.contents[0].contents };
      }
      break;
    }
    case 'star': {
      if (expr.contents.length === 1 && expr.contents[0].name === 'text') {
        const text = expr.contents[0].contents;
        if (text === 'null') {
          return { kind: 'null' };
        } else if (text === 'undefined') {
          return { kind: 'undefined' };
        } else if (text === 'true') {
          return { kind: 'concrete boolean', value: true };
        } else if (text === 'false') {
          return { kind: 'concrete boolean', value: false };
        } else if (text.startsWith('"') && text.endsWith('"')) {
          return { kind: 'concrete string', value: text };
        }
      }

      break;
    }
  }
  return { kind: 'unknown' };
}

function typeFromExprType(type: BiblioType): Type {
  switch (type.kind) {
    case 'union': {
      return type.types.map(typeFromExprType).reduce(join);
    }
    case 'list': {
      return {
        kind: 'list',
        of: type.elements == null ? { kind: 'unknown' } : typeFromExprType(type.elements),
      };
    }
    case 'completion': {
      if (type.completionType === 'abrupt') {
        return { kind: 'completion', of: { kind: 'never' } };
      }
      return {
        kind: 'completion',
        of:
          type.typeOfValueIfNormal == null
            ? { kind: 'unknown' }
            : typeFromExprType(type.typeOfValueIfNormal),
      };
    }
    case 'opaque': {
      const text = type.type;
      if (text.startsWith('"') && text.endsWith('"')) {
        return { kind: 'concrete string', value: text.slice(1, -1) };
      }
      if (text.startsWith('~') && text.endsWith('~')) {
        return { kind: 'enum value', value: text.slice(1, -1) };
      }
      if (text === 'an ECMAScript language value' || text === 'ECMAScript language values') {
        return { kind: 'ES value' };
      }
      if (text === 'a String' || text === 'Strings') {
        return { kind: 'string' };
      }
      if (text === 'a Number' || text === 'Numbers') {
        return { kind: 'number' };
      }
      if (text === 'a Boolean' || text === 'Booleans') {
        return { kind: 'boolean' };
      }
      if (text === 'an integral Number' || text === 'integral Numbers') {
        return { kind: 'integral number' };
      }
      if (text === 'a mathematical value' || text === 'mathematical values') {
        return { kind: 'real' };
      }
      if (text === 'an integer' || text === 'integers') {
        return { kind: 'integer' };
      }
      if (text === 'a non-negative integer' || text === 'non-negative integers') {
        return { kind: 'non-negative integer' };
      }
      if (text === '*null*') {
        return { kind: 'null' };
      }
      if (text === '*undefined*') {
        return { kind: 'undefined' };
      }
      break;
    }
    case 'unused': {
      // this is really only a return type, but might as well handle it
      return { kind: 'enum value', value: '~unused~' };
    }
  }
  return { kind: 'unknown' };
}
