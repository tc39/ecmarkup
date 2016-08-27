'use strict';
const fs = require('fs');
const assert = require('assert');
const diff = require('diff');

const emu = require('../lib/ecmarkup');

const files = fs.readdirSync('test')
    .filter(function (f) { return f.slice(f.length - 5) === '.html'; });

function build(file) {
  return emu.build(file, function (file) {
    return new Promise((resolve, reject) =>
      fs.readFile(file, 'utf-8', (err, data) =>
        err ? reject(err) : resolve(data)));
  });
}

describe('baselines', function() {
  files.forEach(function(file) {
    file = 'test/' + file;
    it(file, function() {
      return build(file)
        .then(function (spec) {
          const contents = spec.toHTML();
          const str = fs.readFileSync(file + '.baseline', 'utf-8').toString();
          if (contents !== str) {
            throw new Error(diff.createPatch(file, contents, str));
          }
        });
    });
  });
});
