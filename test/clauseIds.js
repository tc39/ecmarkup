'use strict';

const assert = require('assert');
const sectionNums = require('../lib/clauseNums').default;

describe('clause id generation', function () {
  let iter;

  beforeEach(function () {
    iter = sectionNums();
  });

  specify('generating clause ids', function () {
    assert.strictEqual(iter.next(0).value, '1');
    assert.strictEqual(iter.next(1).value, '1.1');
    assert.strictEqual(iter.next(1).value, '1.2');
    assert.strictEqual(iter.next(2).value, '1.2.1');
    assert.strictEqual(iter.next(0).value, '2');
    assert.strictEqual(iter.next(0, true).value, 'A');
    assert.strictEqual(iter.next(1, true).value, 'A.1');
    assert.strictEqual(iter.next(1, true).value, 'A.2');
    assert.strictEqual(iter.next(2, true).value, 'A.2.1');
    assert.strictEqual(iter.next(0, true).value, 'B');
  });

  specify('error thrown for skipping clauses', function () {
    assert.throws(function () {
      iter.next(2);
    }, /Skipped clause/);
  });

  specify('error thrown for non-annex following annex', function () {
    assert.throws(function () {
      iter.next(0);
      iter.next(0, true);
      iter.next(0);
    }, /Clauses cannot follow annexes/);
  });

  specify('error thrown for annex not starting at depth 0', function () {
    assert.throws(function () {
      iter.next(0);
      iter.next(1, true);
    }, /First annex must be at depth 0/);
  });
});
