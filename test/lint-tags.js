'use strict';

let { assertLint, assertLintFree, positioned, lintLocationMarker: M } = require('./utils.js');

describe('tags', () => {
  it('unknown "emu-" tags', async () => {
    await assertLint(
      positioned`
        ${M}<emu-not-a-thing>Foo</emu-not-a-thing>
      `,
      {
        ruleId: 'valid-tags',
        nodeType: 'emu-not-a-thing',
        message: 'unknown "emu-" tag "emu-not-a-thing"',
      }
    );
  });

  it('oldid', async () => {
    await assertLint(
      positioned`
        <emu-clause id="foo" oldid="${M}bar">
          <h1>Example</h1>
        </emu-clause>
      `,
      {
        ruleId: 'valid-tags',
        nodeType: 'emu-clause',
        message: '"oldid" isn\'t a thing; did you mean "oldids"?',
      }
    );
  });

  it('negative', async () => {
    await assertLintFree(`
      <emu-clause id="foo" oldids="bar">
        <h1>Example</h1>
      </emu-clause>
    `);
  });
});
