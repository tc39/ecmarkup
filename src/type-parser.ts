import type { Type } from './Biblio';

export class ParseError extends Error {
  declare offset: number;
  constructor(message: string, offset: number) {
    super(message);
    this.offset = offset;
  }
}

export class TypeParser {
  offset = 0;
  allowParensInOpaque = true;
  declare input: string;
  declare remainder: string;

  constructor(input: string) {
    this.remainder = input;
    this.input = input;
  }

  static parse(input: string) {
    return new TypeParser(input).parse();
  }

  parse() {
    const out = this.parseTypePossiblyWithUnmarkedUnion();
    this.eatWs();
    if (this.remainder !== '') {
      if (this.remainder.startsWith('or ')) {
        throw new ParseError(
          `could not determine how to associate "or"; try adding "either"`,
          this.offset,
        );
      }
      throw new ParseError(`type was nonempty after parsing`, this.offset);
    }
    return out;
  }

  private parseTypePossiblyWithUnmarkedUnion(): Type {
    const out = this.parseType();
    this.eatWs();
    let orOffset = this.offset;
    const match = this.eat(/^((, )?or\b|,)/);
    if (match == null) {
      return out;
    }
    let nextFieldIsLast = match[0].includes('or');
    const unionTypes: Type[] = [out];
    while (true) {
      unionTypes.push(this.parseType());
      if (nextFieldIsLast) {
        break;
      }
      this.eatWs();
      const offset = this.offset;
      const sep = this.expect(/^((, )?or\b|,)/);
      if (sep[0].includes('or')) {
        orOffset = offset;
        nextFieldIsLast = true;
      }
    }
    if (
      unionTypes
        .slice(0, -1)
        .some(
          t =>
            t.kind === 'list' ||
            t.kind === 'union' ||
            (t.kind === 'completion' &&
              t.completionType !== 'abrupt' &&
              t.typeOfValueIfNormal !== null),
        )
    ) {
      throw new ParseError(
        `type is ambiguous; can't tell where the "or" attaches (add "either" to disambiguate)`,
        orOffset,
      );
    }
    return squashUnionTypes(unionTypes);
  }

  private parseType(): Type {
    this.eatWs();
    if (this.eat(/^a normal completion containing\b/i) != null) {
      return {
        kind: 'completion',
        typeOfValueIfNormal: this.parseType(),
        completionType: 'normal',
      };
    }
    {
      const match = this.eat(
        /^an? (Completion Record|(normal|abrupt|throw|break|return|continue) completion)/i,
      );
      if (match != null) {
        switch (match[1].toLowerCase()) {
          case 'normal completion': {
            return {
              kind: 'completion',
              typeOfValueIfNormal: null,
              completionType: 'normal',
            };
          }
          case 'completion record': {
            return {
              kind: 'completion',
              typeOfValueIfNormal: null,
              completionType: 'mixed',
            };
          }
          default: {
            return {
              kind: 'completion',
              completionType: 'abrupt',
            };
          }
        }
      }
    }
    if (this.eat(/^(a List|Lists) of\b/i) != null) {
      return {
        kind: 'list',
        elements: this.parseType(),
      };
    }
    if (this.eat(/^(a List|Lists)\b/i) != null) {
      return {
        kind: 'list',
        elements: null,
      };
    }
    {
      const match = this.eat(/^(?:a Record|Records) with field(s?)\b/i);
      if (match != null) {
        const parsedFields: Record<string, Type | null> = { __proto__: null };
        let nextFieldIsLast = match[1] === '';
        while (true) {
          this.eatWs();
          const offset = this.offset;
          const name = this.expect(/^[^\s,]+/)[0];
          if (name in parsedFields) {
            throw new ParseError(`duplicate field name ${JSON.stringify(name)}`, offset);
          }
          this.eatWs();
          if (this.eat(/^\(/) != null) {
            const oldAllowParensInOpaque = this.allowParensInOpaque;
            this.allowParensInOpaque = false;
            const fieldType = this.parseTypePossiblyWithUnmarkedUnion();
            this.allowParensInOpaque = oldAllowParensInOpaque;
            this.expect(/^\)/);
            this.eatWs();
            parsedFields[name] = fieldType;
          } else {
            parsedFields[name] = null;
          }
          if (nextFieldIsLast) {
            break;
          }
          const sep = this.expect(/^((, )?and\b|,)/);
          if (sep[0].includes('and')) {
            nextFieldIsLast = true;
          }
        }
        return {
          kind: 'record',
          fields: parsedFields,
        };
      }
    }
    if (this.eat(/^(?:either|one of)\b/i)) {
      let nextFieldIsLast = false;
      const unionTypes = [];
      while (true) {
        unionTypes.push(this.parseType());
        if (nextFieldIsLast) {
          break;
        }
        this.eatWs();
        const sep = this.expect(/^((, )?or\b|,)/);
        if (sep[0].includes('or')) {
          nextFieldIsLast = true;
        }
      }
      return squashUnionTypes(unionTypes);
    }
    const opaqueStart = this.offset;
    const eater = this.allowParensInOpaque ? /,| or\b/ : /\(|\)|,| or\b/;
    const opaqueThing: Type = {
      kind: 'opaque',
      type: this.eatUntil(eater).trim(),
    };
    const start = this.offset;
    if (this.eat(/^, but not\b/)) {
      // we don't actually care to represent the type
      this.parseTypePossiblyWithUnmarkedUnion();
      opaqueThing.type += this.input.slice(start, this.offset).trim();
      this.eatWs();
      if (!(this.remainder === '' || this.remainder[0] === ')' || this.eat(/^,/) != null)) {
        throw new ParseError(`expecting a parenthesis after a "but not" clause`, this.offset);
      }
    }
    if (opaqueThing.type === '~unused~') {
      return {
        kind: 'unused',
      };
    } else if (opaqueThing.type === '') {
      throw new ParseError(`expected to find a type, got empty string`, opaqueStart);
    }

    return opaqueThing;
  }

  eatWs() {
    this.eat(/^\s+/);
  }

  eat(regexp: RegExp) {
    if (regexp.source[0] !== '^') {
      throw new Error(`eat expects a regex which binds to the start of the string (got ${regexp})`);
    }
    const match = this.remainder.match(regexp);
    if (match == null) {
      return match;
    }
    this.offset += match[0].length;
    this.remainder = this.remainder.slice(match[0].length);
    return match;
  }

  eatUntil(regexp: RegExp) {
    const match = this.remainder.match(regexp);
    if (match == null) {
      const ret = this.remainder;
      this.offset += ret.length;
      this.remainder = '';
      return ret;
    }
    const ret = this.remainder.slice(0, match.index);
    this.offset += ret.length;
    this.remainder = this.remainder.slice(ret.length);
    return ret;
  }

  expect(regexp: RegExp) {
    const match = this.eat(regexp);
    if (match == null) {
      throw new ParseError(`expected ${regexp} at ${JSON.stringify(this.remainder)}`, this.offset);
    }
    return match;
  }
}

function join(a: Type | null, b: Type | null): Type | null {
  if (a == null || b == null) {
    return null;
  }
  if (a.kind === 'union') {
    if (b.kind === 'union') {
      return {
        kind: 'union',
        types: a.types.concat(b.types),
      };
    }
    return {
      kind: 'union',
      types: a.types.concat([b]),
    };
  } else if (b.kind === 'union') {
    return {
      kind: 'union',
      types: b.types.concat([a]),
    };
  } else {
    return {
      kind: 'union',
      types: [a, b],
    };
  }
}

function squashUnionTypes(unionTypes: Type[]): Type {
  const out = unionTypes.flatMap(t => (t.kind === 'union' ? t.types : [t]));
  if (out.every(t => t.kind === 'completion')) {
    return (out as Extract<Type, { kind: 'completion' }>[]).reduce((a, b) => {
      if (a.completionType !== 'abrupt' && b.completionType !== 'abrupt') {
        return {
          kind: 'completion',
          completionType:
            a.completionType === 'normal' && b.completionType === 'normal' ? 'normal' : 'mixed',
          typeOfValueIfNormal: join(a.typeOfValueIfNormal, b.typeOfValueIfNormal),
        };
      } else if (a.completionType === 'abrupt' && b.completionType === 'abrupt') {
        return {
          kind: 'completion',
          completionType: 'abrupt',
        };
      } else {
        return {
          kind: 'completion',
          completionType: 'mixed',
          typeOfValueIfNormal:
            a.completionType !== 'abrupt'
              ? a.typeOfValueIfNormal
              : (b as Exclude<typeof b, { completionType: 'abrupt' }>).typeOfValueIfNormal,
        };
      }
    });
  }
  return {
    kind: 'union',
    types: out,
  };
}
