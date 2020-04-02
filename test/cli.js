'use strict';

const assert = require('assert');
const execSync = require('child_process').execSync;

describe('ecmarkup#cli', () => {
  it('exits cleanly on success', () => {
    execSync('./bin/ecmarkup.js test/example.html', { encoding: 'utf8' });
  });

  it('exits with an error on error', () => {
    assert.throws(() => {
      execSync('./bin/ecmarkup.js test/malformed.bad.html', { encoding: 'utf8' });
    });
  });
});
