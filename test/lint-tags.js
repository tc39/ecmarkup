'use strict';

let { describe, it } = require('node:test');
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
      },
    );
  });

  it('oldid', async () => {
    await assertLint(
      positioned`
        <emu-clause id="foo" ${M}oldid="bar">
          <h1>Example</h1>
        </emu-clause>
      `,
      {
        ruleId: 'valid-tags',
        nodeType: 'emu-clause',
        message: '"oldid" isn\'t a thing; did you mean "oldids"?',
      },
    );
  });

  it('missing closing tag', async () => {
    await assertLint(
      positioned`
        <emu-clause id="foo">
          <h1>Example</h1>
          ${M}<p>some text
          <p>some other text</p>
        </emu-clause>
      `,
      {
        ruleId: 'missing-closing-tag',
        nodeType: 'p',
        message: 'element <p> is missing its closing tag',
      },
    );
  });

  it('negative', async () => {
    await assertLintFree(`
      <emu-clause id="foo" oldids="bar">
        <h1>Example</h1>
        <p>some text</p>
        <br>
        <p>some other text</p>
      </emu-clause>
    `);
  });
});
