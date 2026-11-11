import assert from 'node:assert';
import { describe, it } from 'node:test';
import { dominates, join } from '../lib/type-logic.js';

describe('type lattice', () => {
  it('unknown-non-enum remains distinct from enums and genuine unknown', () => {
    const unknown = { kind: 'unknown' } as const;
    const unknownNonEnum = { kind: 'unknown-non-enum' } as const;
    const empty = { kind: 'enum value', value: 'empty' } as const;
    const unused = { kind: 'enum value', value: 'unused' } as const;
    const unknownNonEnumOrEmpty = join(unknownNonEnum, empty);

    assert(dominates(unknown, unknownNonEnumOrEmpty));
    assert(!dominates(unknownNonEnumOrEmpty, unknown));
    assert(dominates(unknownNonEnumOrEmpty, unknownNonEnum));
    assert(dominates(unknownNonEnumOrEmpty, empty));
    assert(!dominates(unknownNonEnumOrEmpty, unused));
  });
});
