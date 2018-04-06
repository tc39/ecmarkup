'use strict';
const cp = require('child_process');
const assert = require('assert');

describe('detecting duplicate ids', () => {
  it('reports when --verbose flag is present', (done) => {
    cp.exec('./bin/ecmarkup.js --verbose test/duplicate-ids.html', (error, result) => {
      if (error) {
        assert.fail(error);
        done();
        return;
      }
      // "sec-a" appears 4 times in the fixture, so there should be 3 warnings.
      assert.equal(result.match(/<emu-clause> has duplicate id: sec-a/g).length, 3);
      assert.equal(result.includes('<emu-table> has duplicate id: table-of-stuff'), true);
      assert.equal(result.includes('<emu-example> has duplicate id: an-example'), true);
      done();
    });
  });
  it('does not report when --verbose flag is not present', (done) => {
    cp.exec('./bin/ecmarkup.js test/duplicate-ids.html', (error, result) => {
      if (error) {
        assert.fail(error);
        done();
        return;
      }
      assert.equal(result.includes('<emu-clause> has duplicate id: sec-a'), false);
      assert.equal(result.includes('<emu-table> has duplicate id: table-of-stuff'), false);
      assert.equal(result.includes('<emu-example> has duplicate id: an-example'), false);
      done();
    });
  });
});
