import assert from 'assert';
import { describe, it } from 'node:test';
import { execSync } from 'child_process';

const execPath = process.execPath.includes(' ') ? `"${process.execPath}"` : process.execPath;

describe('ecmarkup#cli', { timeout: 4000 }, () => {
  it('exits cleanly on success', () => {
    execSync(`${execPath} ./bin/ecmarkup.js test/baselines/sources/example.html`, {
      encoding: 'utf8',
    });
  });

  it('exits cleanly on warning', () => {
    execSync(`${execPath} ./bin/ecmarkup.js test/baselines/sources/duplicate-ids.html`, {
      encoding: 'utf8',
      stdio: 'ignore',
    });
  });

  it('exits with an error on error', () => {
    assert.throws(() => {
      execSync(`${execPath} ./bin/ecmarkup.js test/baselines/sources/malformed.bad.html`, {
        encoding: 'utf8',
        stdio: 'ignore',
      });
    });
  });

  it('exits with an error on warning when using --strict', () => {
    assert.throws(() => {
      execSync(`${execPath} ./bin/ecmarkup.js --strict test/baselines/sources/duplicate-ids.html`, {
        encoding: 'utf8',
        stdio: 'ignore',
      });
    });
  });
});

describe('emu-format --check', { timeout: 4000 }, () => {
  it('exits cleanly if the file needs no formatting', () => {
    execSync(`${execPath} ./bin/emu-format.js --check test/format-good.html`, {
      encoding: 'utf8',
    });
  });

  it('exits with an error if the file needs formatting', () => {
    assert.throws(() => {
      execSync(`${execPath} ./bin/emu-format.js --check test/format-bad.html`, {
        encoding: 'utf8',
      });
    });
  });

  it('exits with an error if any files in the list need formatting', () => {
    assert.throws(() => {
      execSync(
        `${execPath} ./bin/emu-format.js --check test/format-good.html test/format-bad.html`,
        {
          encoding: 'utf8',
        },
      );
    });
  });
});
