'use strict';
const assert = require('assert');

const build = require('../lib/ecmarkup').build;

const doc =
  '<!doctype html><pre class=metadata>toc: false\ncopyright: false\nassets: none</pre><emu-clause id=sec><h1>hi</h1></emu-clause>';
const out =
  '<!doctype html>\n<head><meta charset="utf-8"><script type="application/json" id="sdo-map">{}</script></head><body><div id="spec-container"><emu-clause id="sec"><h1 class="first"><span class="secnum">1</span> hi</h1></emu-clause></div></body>';

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
        })
    );
    assert.equal(spec.toHTML(), out);
  });
});
