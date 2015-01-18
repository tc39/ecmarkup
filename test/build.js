var assert = require('assert');
var Promise = require('bluebird');

var build = require('../lib/ecmarkup').build;

var doc = '<!doctype html><emu-clause><h1>hi</h1></emu-clause>';
var out = '<!doctype html>\n<head></head><body><div><h2>Table of Contents</h2><ol class="toc"><li><a href="#"><span class="secnum">1</span> hi</a></li></ol></div><emu-clause><h1><span class="secnum">1</span>hi</h1></emu-clause></body>';
function fetch(file) {
  if(file.match(/\.json$/)) {
    return '{}';
  } else {
    return doc;
  }
}

describe('ecmarkup#build', function() {
  it('takes a fetch callback that returns a promise', function() {
    return build('root.html', function(file) {
      return new Promise(function(res) {
        process.nextTick(function() {
          res(fetch(file));
        });
      });
    }).then(function(c) {
      assert.equal(c,out);
    });
  });
})
