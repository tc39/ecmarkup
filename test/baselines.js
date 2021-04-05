'use strict';
const fs = require('fs');

const emu = require('../lib/ecmarkup');

const SOURCES_DIR = 'test/baselines/sources/';
const LOCAL_DIR = 'test/baselines/generated-local/';
const REFERENCE_DIR = 'test/baselines/generated-reference/';

const files = fs
  .readdirSync(SOURCES_DIR)
  .filter(f => f.endsWith('.html') && !f.endsWith('.bad.html'));

function build(file) {
  return emu.build(
    file,
    file =>
      new Promise((resolve, reject) =>
        fs.readFile(file, 'utf-8', (err, data) => (err ? reject(err) : resolve(data)))
      )
  );
}

describe('baselines', () => {
  files.forEach(file => {
    const local = LOCAL_DIR + file;
    const reference = REFERENCE_DIR + file;
    file = SOURCES_DIR + file;
    it(file, async () => {
      let spec = await build(file);
      const contents = spec.toHTML();
      let str;
      try {
        str = fs.readFileSync(reference, 'utf8');
      } catch (e) {
        // ignored
      }
      if (contents !== str) {
        try {
          fs.mkdirSync(LOCAL_DIR);
        } catch (e) {
          // ignored
        }
        fs.writeFileSync(local, contents, 'utf8');
        const error = new Error('Incorrect baseline');
        error.expected = str || '';
        error.actual = contents;
        throw error;
      }
    });
  });
});
