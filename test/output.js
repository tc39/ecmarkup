'use strict';
const fs = require('fs');

const emu = require('../lib/ecmarkup');

const files = fs.readdirSync('test')
  .filter(function (f) { return f.endsWith('.html') && !f.endsWith('.bad.html'); });

function build(file) {
  return emu.build(file, function (file) {
    return new Promise((resolve, reject) =>
      fs.readFile(file, 'utf-8', (err, data) =>
        err ? reject(err) : resolve(data)));
  });
}

describe('baselines', function() {
  files.forEach(function(file) {
    const local = 'test/baselines/local/' + file;
    const reference = 'test/baselines/reference/' + file;
    file = 'test/' + file;
    it(file, function() {
      return build(file)
        .then(function (spec) {
          const contents = spec.toHTML();
          let str;
          try {
            str = fs.readFileSync(reference, 'utf8');
          } catch (e) {
            // ignored
          }
          if (contents !== str) {
            try {
              fs.mkdirSync('test/baselines/local');
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
});
