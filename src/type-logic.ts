import type Biblio from './Biblio';
import type { Type as BiblioType } from './Biblio';
import type { Expr, NonSeq } from './expr-parser';

export type Type =
  | { kind: 'unknown' } // top
  | { kind: 'never' } // bottom
  | { kind: 'union'; of: NonUnion[] } // constraint: nothing in the union dominates anything else in the union
  | { kind: 'list'; of: Type }
  | { kind: 'record' } // TODO more precision
  | { kind: 'normal completion'; of: Type }
  | { kind: 'abrupt completion' }
  | { kind: 'real' }
  | { kind: 'integer' }
  | { kind: 'non-negative integer' }
  | { kind: 'negative integer' }
  | { kind: 'positive integer' }
  | { kind: 'concrete real'; value: string }
  | { kind: 'ES value' }
  | { kind: 'object' }
  | { kind: 'function' }
  | { kind: 'string' }
  | { kind: 'number' }
  | { kind: 'integral number' }
  | { kind: 'bigint' }
  | { kind: 'boolean' }
  | { kind: 'null' }
  | { kind: 'undefined' }
  | { kind: 'concrete string'; value: string }
  | { kind: 'concrete number'; value: number }
  | { kind: 'concrete bigint'; value: bigint }
  | { kind: 'concrete boolean'; value: boolean }
  | { kind: 'enum value'; value: string };
type NonUnion = Exclude<Type, { kind: 'union' }>;
const simpleKinds = new Set<Type['kind']>([
  'unknown',
  'never',
  'record',
  'abrupt completion',
  'real',
  'integer',
  'non-negative integer',
  'negative integer',
  'positive integer',
  'ES value',
  'string',
  'object',
  'function',
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
  record: ['normal completion', 'abrupt completion'],
  real: [
    'integer',
    'non-negative integer',
    'negative integer',
    'positive integer',
    'concrete real',
  ],
  integer: ['non-negative integer', 'negative integer', 'positive integer'],
  'non-negative integer': ['positive integer'],
  'ES value': [
    'string',
    'object',
    'function',
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
export function dominates(a: Type, b: Type): boolean {
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
    (a.kind === 'normal completion' && b.kind === 'normal completion')
  ) {
    return dominates(a.of, b.of);
  }
  if (simpleKinds.has(a.kind) && simpleKinds.has(b.kind) && a.kind === b.kind) {
    return true;
  }
  if (dominateGraph[a.kind]?.includes(b.kind) ?? false) {
    return true;
  }
  if (a.kind === 'integer' && b.kind === 'concrete real') {
    return !b.value.includes('.');
  }
  if (a.kind === 'integral number' && b.kind === 'concrete number') {
    return Number.isFinite(b.value) && b.value === Math.round(b.value);
  }
  if (a.kind === 'non-negative integer' && b.kind === 'concrete real') {
    return !b.value.includes('.') && b.value[0] !== '-';
  }
  if (a.kind === 'negative integer' && b.kind === 'concrete real') {
    return !b.value.includes('.') && b.value[0] === '-';
  }
  if (a.kind === 'positive integer' && b.kind === 'concrete real') {
    return !b.value.includes('.') && b.value[0] !== '-' && b.value !== '0';
  }
  if (
    a.kind === b.kind &&
    [
      'concrete string',
      'concrete number',
      'concrete real',
      'concrete bigint',
      'concrete boolean',
      'enum value',
    ].includes(a.kind)
  ) {
    // @ts-expect-error TS is not quite smart enough for this
    return Object.is(a.value, b.value);
  }
  return false;
}

function addToUnion(types: NonUnion[], type: NonUnion): Type {
  if (type.kind === 'normal completion') {
    const existingNormalCompletionIndex = types.findIndex(t => t.kind === 'normal completion');
    if (existingNormalCompletionIndex !== -1) {
      // prettier-ignore
      const joined = join(types[existingNormalCompletionIndex], type) as Type & { kind: 'normal completion' };
      if (types.length === 1) {
        return joined;
      }
      const typesCopy = [...types];
      typesCopy.splice(existingNormalCompletionIndex, 1, joined);
      return { kind: 'union', of: typesCopy };
    }
  }

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
        a,
      );
    }
    return addToUnion(a.of, b);
  }
  if (
    (a.kind === 'list' && b.kind === 'list') ||
    (a.kind === 'normal completion' && b.kind === 'normal completion')
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
  if (a.kind === 'list' && b.kind === 'list') {
    return { kind: 'list', of: meet(a.of, b.of) };
  }
  if (a.kind === 'normal completion' && b.kind === 'normal completion') {
    const inner = meet(a.of, b.of);
    if (inner.kind === 'never') {
      return { kind: 'never' };
    }
    return { kind: 'normal completion', of: inner };
  }
  return { kind: 'never' };
}

export function serialize(type: Type): string {
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
    case 'normal completion': {
      if (type.of.kind === 'never') {
        return 'never';
      } else if (type.of.kind === 'unknown') {
        return 'a normal completion';
      }
      return 'a normal completion containing ' + serialize(type.of);
    }
    case 'abrupt completion': {
      return 'an abrupt completion';
    }
    case 'real': {
      return 'mathematical value';
    }
    case 'integer':
    case 'non-negative integer':
    case 'negative integer':
    case 'positive integer':
    case 'null':
    case 'undefined': {
      return type.kind;
    }
    case 'concrete string': {
      return `"${type.value}"`;
    }
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
      if (Object.is(type.value, 0 / 0)) {
        return '*NaN*';
      }
      let repr;
      if (Object.is(type.value, -0)) {
        repr = '-0';
      } else if (type.value === 0) {
        repr = '+0';
      } else if (type.value === 2e308) {
        repr = '+&infin;';
      } else if (type.value === -2e308) {
        repr = '-&infin;';
      } else if (type.value > 4503599627370495.5) {
        repr = String(BigInt(type.value));
      } else {
        repr = String(type.value);
      }
      return `*${repr}*<sub>𝔽</sub>`;
    }
    case 'concrete bigint': {
      return `*${type.value}*<sub>ℤ</sub>`;
    }
    case 'ES value': {
      return 'ECMAScript language value';
    }
    case 'boolean': {
      return 'Boolean';
    }
    case 'string': {
      return 'String';
    }
    case 'object': {
      return 'Object';
    }
    case 'function': {
      return 'Function';
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

export function typeFromExpr(
  expr: Expr,
  biblio: Biblio,
  warn: (offset: number, message: string) => void,
): Type {
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
        case '𝔽': {
          const text = items[0].contents[0].contents;
          let value;
          if (text === '-0') {
            value = -0;
          } else if (text === '+&infin;') {
            value = 2e308;
          } else if (text === '-&infin;') {
            value = -2e308;
          } else {
            value = parseFloat(text);
          }
          return { kind: 'concrete number', value };
        }
        case 'ℤ': {
          return { kind: 'concrete bigint', value: BigInt(items[0].contents[0].contents) };
        }
      }
    }

    if (items[0]?.name === 'text' && ['!', '?'].includes(items[0].contents.trim())) {
      const remaining = stripWhitespace(items.slice(1));
      if (remaining.length === 1 && ['call', 'sdo-call'].includes(remaining[0].name)) {
        const callType = typeFromExpr(remaining[0], biblio, warn);
        if (isCompletion(callType)) {
          const normal: Type =
            callType.kind === 'normal completion'
              ? callType.of
              : callType.kind === 'abrupt completion'
                ? // the expression `? _abrupt_` strictly speaking has type `never`
                  // however we mostly use `never` to mean user error, so use unknown instead
                  // this should only ever happen after `Return`
                  { kind: 'unknown' }
                : callType.of.find(k => k.kind === 'normal completion')?.of ?? {
                    kind: 'unknown',
                  };
          return normal;
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
        of: expr.elements.map(t => typeFromExpr(t, biblio, warn)).reduce(join, { kind: 'never' }),
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

      // special case: `Completion` is identity on completions
      if (expr.name === 'call' && calleeName === 'Completion') {
        if (expr.arguments.length === 1) {
          const inner = typeFromExpr(expr.arguments[0], biblio, warn);
          if (!isCompletion(inner)) {
            // probably unknown, we might as well refine to "some completion"
            return {
              kind: 'union',
              of: [
                { kind: 'normal completion', of: { kind: 'unknown' } },
                { kind: 'abrupt completion' },
              ],
            };
          }
        } else {
          warn(expr.location.start.offset, 'expected Completion to be passed exactly one argument');
        }
      }

      // special case: `NormalCompletion` wraps its input
      if (expr.name === 'call' && calleeName === 'NormalCompletion') {
        if (expr.arguments.length === 1) {
          return { kind: 'normal completion', of: typeFromExpr(expr.arguments[0], biblio, warn) };
        } else {
          warn(
            expr.location.start.offset,
            'expected NormalCompletion to be passed exactly one argument',
          );
        }
      }

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
        } else if (text === 'NaN') {
          return { kind: 'concrete number', value: 0 / 0 };
        } else if (text === 'true') {
          return { kind: 'concrete boolean', value: true };
        } else if (text === 'false') {
          return { kind: 'concrete boolean', value: false };
        } else if (text.startsWith('"') && text.endsWith('"')) {
          return { kind: 'concrete string', value: text.slice(1, -1) };
        }
      }

      break;
    }
  }
  return { kind: 'unknown' };
}

export function typeFromExprType(type: BiblioType): Type {
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
        return { kind: 'abrupt completion' };
      } else {
        const normalType: Type =
          type.typeOfValueIfNormal == null
            ? { kind: 'unknown' }
            : typeFromExprType(type.typeOfValueIfNormal);
        if (type.completionType === 'normal') {
          return { kind: 'normal completion', of: normalType };
        } else if (type.completionType === 'mixed') {
          return {
            kind: 'union',
            of: [{ kind: 'normal completion', of: normalType }, { kind: 'abrupt completion' }],
          };
        } else {
          throw new Error('unreachable: completion kind ' + type.completionType);
        }
      }
    }
    case 'opaque': {
      const text = type.type;
      if (text.startsWith('"') && text.endsWith('"')) {
        return { kind: 'concrete string', value: text.slice(1, -1) };
      }
      if (text.startsWith('~') && text.endsWith('~')) {
        return { kind: 'enum value', value: text.slice(1, -1) };
      }
      if (/^-?[0-9]+(\.[0-9]+)?$/.test(text)) {
        return { kind: 'concrete real', value: text };
      }
      if (text.startsWith('*') && text.endsWith('*<sub>𝔽</sub>')) {
        const innerText = text.slice(1, -14);
        let value;
        if (innerText === '-0') {
          value = -0;
        } else if (innerText === '+&infin;') {
          value = 2e308;
        } else if (innerText === '-&infin;') {
          value = -2e308;
        } else {
          value = parseFloat(innerText);
        }
        return { kind: 'concrete number', value };
      }
      if (text === '*NaN*') {
        return { kind: 'concrete number', value: 0 / 0 };
      }
      if (text === '*true*') {
        return { kind: 'concrete boolean', value: true };
      }
      if (text === '*false*') {
        return { kind: 'concrete boolean', value: false };
      }
      if (text.startsWith('*') && text.endsWith('*<sub>ℤ</sub>')) {
        return { kind: 'concrete bigint', value: BigInt(text.slice(1, -14)) };
      }
      if (text === 'an ECMAScript language value' || text === 'ECMAScript language values') {
        return { kind: 'ES value' };
      }
      if (text === 'a String' || text === 'Strings') {
        return { kind: 'string' };
      }
      if (text === 'an Object' || text === 'Objects') {
        return { kind: 'object' };
      }
      if (text === 'a function' || text === 'functions') {
        return { kind: 'function' };
      }
      if (text === 'a Number' || text === 'Numbers') {
        return { kind: 'number' };
      }
      if (text === 'a Boolean' || text === 'Booleans') {
        return { kind: 'boolean' };
      }
      if (text === 'a BigInt' || text === 'BigInts') {
        return { kind: 'bigint' };
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
      if (text === 'a negative integer' || text === 'negative integers') {
        return { kind: 'negative integer' };
      }
      if (text === 'a positive integer' || text === 'positive integers') {
        return { kind: 'positive integer' };
      }
      if (text === 'a time value' || text === 'time values') {
        return {
          kind: 'union',
          of: [{ kind: 'integral number' }, { kind: 'concrete number', value: 0 / 0 }],
        };
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
      return { kind: 'enum value', value: 'unused' };
    }
  }
  return { kind: 'unknown' };
}

export function isCompletion(
  type: Type,
): type is Type & { kind: 'normal completion' | 'abrupt completion' | 'union' } {
  return (
    type.kind === 'normal completion' ||
    type.kind === 'abrupt completion' ||
    (type.kind === 'union' && type.of.some(isCompletion))
  );
}

export function isPossiblyAbruptCompletion(
  type: Type,
): type is Type & { kind: 'abrupt completion' | 'union' } {
  return (
    type.kind === 'abrupt completion' ||
    (type.kind === 'union' && type.of.some(isPossiblyAbruptCompletion))
  );
}

export function stripWhitespace(items: NonSeq[]) {
  items = [...items];
  while (items[0]?.name === 'text' && /^\s*$/.test(items[0].contents)) {
    items.shift();
  }
  while (
    items[items.length - 1]?.name === 'text' &&
    // @ts-expect-error
    /^\s*$/.test(items[items.length - 1].contents)
  ) {
    items.pop();
  }
  return items;
}
