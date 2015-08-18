'use strict';
const fs = require('fs');
const assert = require('assert');
const Promise = require('bluebird');
const readFile = Promise.promisify(fs.readFile);
const diff = require('diff');

const emu = require('../lib/ecmarkup');

const files = fs.readdirSync('test')
    .filter(function (f) { return f.slice(f.length - 5) === '.html'; });

function build(file) {
  return emu.build(file, function (file) {
    return readFile(file, 'utf-8');
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
