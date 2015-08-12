var fs = require('fs');
var assert = require('assert');
var Promise = require('bluebird');
var readFile = Promise.promisify(fs.readFile);
var diff = require('diff');

var emu = require('../lib/ecmarkup');

var files = fs.readdirSync('test').filter(function (f) { return f.slice(f.length - 5) === ".html" });

function build(file) {
  return emu.build(file, function (file) {
    return readFile(file, 'utf-8');
  });
}

describe('baselines', function() {
  files.forEach(function(file) {
    file = "test/" + file;
    it(file, function() {
      return build(file)
        .then(function (spec) {
          var contents = spec.toHTML();
          var str = fs.readFileSync(file + '.baseline', 'utf-8').toString();
          if(contents !== str) {
            throw new Error(diff.createPatch(file, contents, str))
          }
        });
    })
  })
});
