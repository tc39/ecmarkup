var fs = require('fs');
var assert = require('assert');
var Promise = require('bluebird');
var readFile = Promise.promisify(fs.readFile);

var build = require('../lib/ecmarkup').build;

var testPath = 'test/test.html';

describe('output of test.html', function() {
  it("is correct", function() {
    return build(testPath, function(file) {
      return readFile(file, 'utf-8');
    }).then(function(contents) {
      assert.equal(contents,
          fs.readFileSync(testPath + '.baseline', 'utf-8').toString());
    });
  });
});
