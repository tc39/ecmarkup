import assert from 'assert';
import { describe, it } from 'node:test';

import { build } from '../lib/ecmarkup.js';

const doc =
  '<!doctype html><pre class=metadata>toc: false\ncopyright: false\nassets: none</pre><emu-clause id=sec><h1>hi</h1></emu-clause>';

function fetch(file: string) {
  if (file.match(/\.json$/)) {
    return '{}';
  } else {
    return doc;
  }
}

describe('ecmarkup#build', () => {
  it('takes a fetch callback that returns a promise', async () => {
    const spec = await build(
      'root.html',
      file =>
        new Promise(res => {
          process.nextTick(() => res(fetch(file)));
        }),
    );
    const result = (spec as unknown as { toHTML(): string }).toHTML();
    assert.equal(typeof result, 'string');
    assert(result.includes(`<div id="spec-container">`));
  });
});
