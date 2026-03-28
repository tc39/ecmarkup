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

  describe('minify option', () => {
    async function buildWithMinify(minify?: boolean) {
      const spec = await build('root.html', file => fetch(file), {
        toc: false,
        copyright: false,
        assets: 'none',
        minify,
      });
      return spec.generatedFiles.get(null) as string;
    }

    it('minifies by default when option is omitted', async () => {
      const defaultOutput = await buildWithMinify(undefined);
      const unminified = await buildWithMinify(false);
      assert(
        defaultOutput.length < unminified.length,
        `Expected default (${defaultOutput.length}) to be smaller than unminified (${unminified.length})`,
      );
    });

    it('minifies when minify is true', async () => {
      const minified = await buildWithMinify(true);
      const unminified = await buildWithMinify(false);
      assert(
        minified.length < unminified.length,
        `Expected minified (${minified.length}) to be smaller than unminified (${unminified.length})`,
      );
    });

    it('does not minify when minify is false', async () => {
      const unminified = await buildWithMinify(false);
      assert(
        unminified.includes(`<div id="spec-container">`),
        'Expected unminified output to preserve whitespace and attribute quotes',
      );
    });
  });
});
