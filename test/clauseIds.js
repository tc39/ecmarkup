import assert from 'assert';
import { describe, it, beforeEach } from 'node:test';
import clauseNumsModule from '../lib/clauseNums.js';
const sectionNums = clauseNumsModule.default;

describe('clause id generation', () => {
  let iter;

  beforeEach(() => {
    iter = sectionNums({ opts: {} });
  });

  it('generating clause ids', () => {
    const CLAUSE = { nodeName: 'EMU-CLAUSE', hasAttribute: () => false };
    const ANNEX = { nodeName: 'EMU-ANNEX', hasAttribute: () => false };
    assert.strictEqual(iter.next([], CLAUSE), '1');
    assert.strictEqual(iter.next([{}], CLAUSE), '1.1');
    assert.strictEqual(iter.next([{}], CLAUSE), '1.2');
    assert.strictEqual(iter.next([{}, {}], CLAUSE), '1.2.1');
    assert.strictEqual(iter.next([], CLAUSE), '2');
    assert.strictEqual(iter.next([], ANNEX), 'A');
    assert.strictEqual(iter.next([{}], ANNEX), 'A.1');
    assert.strictEqual(iter.next([{}], ANNEX), 'A.2');
    assert.strictEqual(iter.next([{}, {}], ANNEX), 'A.2.1');
    assert.strictEqual(iter.next([], ANNEX), 'B');
  });
});
