'use strict';
const assert = require('assert');
const { describe, it } = require('node:test');

const build = require('../lib/ecmarkup').build;

const doc =
  '<!doctype html><pre class=metadata>toc: false\ncopyright: false\nassets: none</pre><emu-clause id=sec><h1>hi</h1></emu-clause>';

function fetch(file) {
  if (file.match(/\.json$/)) {
    return '{}';
  } else {
    return doc;
  }
}

describe('ecmarkup#build', () => {
  it('takes a fetch callback that returns a promise', async () => {
    let spec = await build(
      'root.html',
      file =>
        new Promise(res => {
          process.nextTick(() => res(fetch(file)));
        }),
    );
    let result = spec.toHTML();
    assert.equal(typeof result, 'string');
    assert(result.includes(`<div id="spec-container">`));
  });
});
