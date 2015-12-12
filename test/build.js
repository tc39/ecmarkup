'use strict';
const assert = require('assert');
const Promise = require('bluebird');

const build = require('../lib/ecmarkup').build;

const doc = '<!doctype html><pre class=metadata>toc: false\ncopyright: false</pre><emu-clause><h1>hi</h1></emu-clause>';
const out = '<!doctype html>\n<head><meta charset="utf-8"></head><body><emu-clause><h1><span class="secnum">1</span>hi<span class="utils"><span class="anchor"><a href="#">#</a></span></span></h1></emu-clause></body>';
function fetch(file) {
  if (file.match(/\.json$/)) {
    return '{}';
  } else {
    return doc;
  }
}

describe('ecmarkup#build', () => {
  it('takes a fetch callback that returns a promise', () => {
    return build('root.html', file => {
      return new Promise(res => {
        process.nextTick(() => res(fetch(file)));
      });
    }).then(spec => {
      assert.equal(spec.toHTML(), out);
    });
  });
});
