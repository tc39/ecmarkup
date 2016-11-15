'use strict';
const assert = require('assert');

const build = require('../lib/ecmarkup').build;

const doc = '<!doctype html><pre class=metadata>toc: false\ncopyright: false</pre><emu-clause id=sec><h1>hi</h1></emu-clause>';
const out = '<!doctype html>\n<head><meta charset="utf-8"></head><body><div id="spec-container"><emu-clause id="sec"><h1><span class="secnum">1</span>hi<span class="utils"><span class="anchor"><a href="#sec">link</a></span><span class="anchor"><a href="#" class="utils-pin">pin</a></span></span></h1></emu-clause></div></body>';
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
