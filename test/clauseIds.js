'use strict';

const assert = require('assert');
const { describe, it, beforeEach } = require('node:test');
const sectionNums = require('../lib/clauseNums').default;

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
