'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const emu = require('../lib/ecmarkup');

const SOURCES_DIR = 'test/baselines/sources/';
const LOCAL_DIR = 'test/baselines/generated-local/';
const REFERENCE_DIR = 'test/baselines/generated-reference/';

const files = fs
  .readdirSync(SOURCES_DIR)
  .filter(f => f.endsWith('.html') && !f.endsWith('.bad.html'));

const ecma262biblio = require('./ecma262biblio.json');

function build(file, options) {
  return emu.build(
    file,
    file =>
      new Promise((resolve, reject) =>
        fs.readFile(file, 'utf-8', (err, data) => (err ? reject(err) : resolve(data)))
      ),
    {
      extraBiblios: [ecma262biblio],
      ...options,
    }
  );
}

describe('baselines', () => {
  let rebaseline = !!process.env.npm_config_update_baselines;
  let dirToWriteOnFailure = rebaseline ? REFERENCE_DIR : LOCAL_DIR;
  let optionsSets = [{ lintSpec: false }];
  for (let file of files) {
    const reference = REFERENCE_DIR + file;
    it(SOURCES_DIR + file, async () => {
      let expectedFiles = new Map();

      (function walk(f) {
        if (!fs.existsSync(f)) {
          return;
        }
        if (fs.lstatSync(f).isDirectory()) {
          for (let file of fs.readdirSync(f)) {
            walk(path.join(f, file));
          }
        } else {
          expectedFiles.set(path.relative(reference, f), fs.readFileSync(f, 'utf8'));
        }
      })(reference);

      let spec = await build(SOURCES_DIR + file, {});

      let actualFiles = handleSingleFileOutput(spec.generatedFiles);

      let threw = true;
      try {
        if (expectedFiles.size === 0) {
          throw new Error('Baseline does not exist');
        }
        assert.deepStrictEqual(actualFiles, expectedFiles);
        threw = false;
      } finally {
        if (threw) {
          for (let [fileToWrite, contents] of actualFiles) {
            let toWrite = path.resolve(dirToWriteOnFailure, path.join(file, fileToWrite));
            fs.mkdirSync(path.dirname(toWrite), { recursive: true });
            fs.writeFileSync(toWrite, contents, 'utf8');
          }
          if (rebaseline) {
            console.log('Updated!');
            // we intentionally swallow the exception
            // eslint-disable-next-line no-unsafe-finally
            return;
          }
        }
      }

      if (rebaseline) {
        return;
      }
      for (let options of optionsSets) {
        let spec = await build(SOURCES_DIR + file, options);
        let actualFiles = handleSingleFileOutput(spec.generatedFiles);
        assert.deepStrictEqual(
          actualFiles,
          expectedFiles,
          `output differed when using option ${JSON.stringify(options)}`
        );
      }
    });
  }
});

function handleSingleFileOutput(files) {
  if (files.size === 1 && files.has(null)) {
    // i.e. single-file output
    files.set('', files.get(null));
    files.delete(null);
  }
  return files;
}
