'use strict';

const assert = require('assert');
const execSync = require('child_process').execSync;
const execPath = process.execPath.includes(' ') ? `"${process.execPath}"` : process.execPath;

describe('ecmarkup#cli', () => {
  it('exits cleanly on success', () => {
    execSync(`${execPath} ./bin/ecmarkup.js test/example.html`, { encoding: 'utf8' });
  });

  it('exits cleanly on warning', () => {
    execSync(`${execPath} ./bin/ecmarkup.js test/duplicate-ids.html`, {
      encoding: 'utf8',
      stdio: 'ignore',
    });
  });

  it('exits with an error on error', () => {
    assert.throws(() => {
      execSync(`${execPath} ./bin/ecmarkup.js test/malformed.bad.html`, {
        encoding: 'utf8',
        stdio: 'ignore',
      });
    });
  });

  it('exits with an error on warning when using --strict', () => {
    assert.throws(() => {
      execSync(`${execPath} ./bin/ecmarkup.js --strict test/duplicate-ids.html`, {
        encoding: 'utf8',
        stdio: 'ignore',
      });
    });
  });
});
