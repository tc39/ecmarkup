import assert from 'assert';
import { describe, it, beforeEach } from 'node:test';
import clauseNumsModule from '../lib/clauseNums.js';
import type { ClauseNumberIterator } from '../lib/clauseNums.js';
import type ClauseModule from '../lib/Clause.js';
import type { Spec } from '../lib/ecmarkup.js';

type Clause = InstanceType<typeof ClauseModule.default>;
const sectionNums = clauseNumsModule.default;

describe('clause id generation', () => {
  let iter: ClauseNumberIterator;

  beforeEach(() => {
    iter = sectionNums({ opts: {} } as Spec);
  });

  it('generating clause ids', () => {
    const CLAUSE = { nodeName: 'EMU-CLAUSE', hasAttribute: () => false } as unknown as HTMLElement;
    const ANNEX = { nodeName: 'EMU-ANNEX', hasAttribute: () => false } as unknown as HTMLElement;
    const mockClause = {} as Clause;
    assert.strictEqual(iter.next([], CLAUSE), '1');
    assert.strictEqual(iter.next([mockClause], CLAUSE), '1.1');
    assert.strictEqual(iter.next([mockClause], CLAUSE), '1.2');
    assert.strictEqual(iter.next([mockClause, mockClause], CLAUSE), '1.2.1');
    assert.strictEqual(iter.next([], CLAUSE), '2');
    assert.strictEqual(iter.next([], ANNEX), 'A');
    assert.strictEqual(iter.next([mockClause], ANNEX), 'A.1');
    assert.strictEqual(iter.next([mockClause], ANNEX), 'A.2');
    assert.strictEqual(iter.next([mockClause, mockClause], ANNEX), 'A.2.1');
    assert.strictEqual(iter.next([], ANNEX), 'B');
  });
});
