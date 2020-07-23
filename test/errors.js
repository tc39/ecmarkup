'use strict';

let { lintLocationMarker: M, positioned, assertError } = require('./utils.js');

describe('errors', () => {
  it('no contributors', async () => {
    await assertError(
      '',
      {
        ruleId: 'no-contributors',
        nodeType: 'html',
        message:
          'contributors not specified, skipping copyright boilerplate. specify contributors in your frontmatter metadata',
      },
      {
        copyright: true,
      }
    );
  });

  it('metadata failed', async () => {
    await assertError(
      positioned`
      <pre class=metadata>
        this isn't valid yaml: "
${M}      </pre>
      `,
      {
        ruleId: 'invalid-metadata',
        nodeType: 'pre',
        message:
          'metadata block failed to parse: unexpected end of the stream within a double quoted scalar',
      }
    );
  });

  it('could not find replacement algorithm target', async () => {
    await assertError(
      positioned`
      <emu-alg replaces-step="${M}missing">
        1. Foo.
      </emu-alg>
      `,
      {
        ruleId: 'invalid-replacement',
        nodeType: 'emu-alg',
        message: 'could not find step "missing"',
      }
    );
  });

  it('replacement algorithm targets something other than a step', async () => {
    await assertError(
      positioned`
      <emu-clause id="clause">
      <h1>Title</h1>
        This is a clause.
      </emu-clause>
      <emu-alg replaces-step="${M}clause">
        1. Foo.
      </emu-alg>
      `,
      {
        ruleId: 'invalid-replacement',
        nodeType: 'emu-alg',
        message: 'expected algorithm to replace a step, not a clause',
      }
    );
  });

  it('cycle in replacement algorithms', async () => {
    await assertError(
      `
      <emu-alg replaces-step="step-foo">
        1. [id="step-foo"] Foo.
      </emu-alg>
      `,
      {
        ruleId: 'invalid-replacement',
        nodeType: 'html',
        message:
          'could not unambiguously determine replacement algorithm offsets - do you have a cycle in your replacement algorithms?',
      }
    );
  });

  it('nontrivial cycle in replacement algorithms', async () => {
    await assertError(
      `
      <emu-alg replaces-step="step-foo">
        1. [id="step-bar"] Foo.
      </emu-alg>

      <emu-alg replaces-step="step-bar">
        1. [id="step-baz"] Foo.
      </emu-alg>

      <emu-alg replaces-step="step-baz">
        1. [id="step-foo"] Foo.
      </emu-alg>
      `,
      {
        ruleId: 'invalid-replacement',
        nodeType: 'html',
        message:
          'could not unambiguously determine replacement algorithm offsets - do you have a cycle in your replacement algorithms?',
      }
    );
  });

  it('labeled step in multi-step replacement algorithm', async () => {
    await assertError(
      positioned`
      <emu-alg>
        1. [id="step-foo"] Foo.
      </emu-alg>
      <emu-alg replaces-step="step-foo">
        1. Foo.
        1. [id="${M}step-bar"] Foo.
      </emu-alg>
      `,
      {
        ruleId: 'labeled-step-in-replacement',
        nodeType: 'emu-alg',
        message:
          'labeling a step in a replacement algorithm which has multiple top-level steps is unsupported because the resulting step number would be ambiguous',
      }
    );
  });

  it('note type', async () => {
    await assertError(
      positioned`
      <emu-clause id="example">
        <h1>Title</h1>
        <emu-note type="${M}unknown"></emu-note>
      </emu-clause>
      `,
      {
        ruleId: 'invalid-note',
        nodeType: 'emu-note',
        message: 'unknown note type "unknown"',
      }
    );
  });

  it('duplicate id', async () => {
    await assertError(
      positioned`
      <emu-clause id="example">
        <h1>Title</h1>
        <emu-table id="${M}example">
          <table>
            <tr><th>Column 1</th><th>Column 2</th></tr>
            <tr><td>Value</td><td>Value 2</td></tr>
          </table>
        </emu-table>
      </emu-clause>
      `,
      {
        ruleId: 'duplicate-id',
        nodeType: 'emu-table',
        message: '<emu-table> has duplicate id "example"',
      }
    );
  });

  it('missing id', async () => {
    await assertError(
      positioned`
      ${M}<emu-clause>
        <h1>Title</h1>
      </emu-clause>
      `,
      {
        ruleId: 'missing-id',
        nodeType: 'emu-clause',
        message: "clause doesn't have an id",
      }
    );
  });

  it('xref neither attribute', async () => {
    await assertError(
      positioned`
      ${M}<emu-xref></emu-xref>
      `,
      {
        ruleId: 'invalid-xref',
        nodeType: 'emu-xref',
        message: 'xref has neither href nor aoid',
      }
    );
  });

  it('xref both attributes', async () => {
    await assertError(
      positioned`
      <emu-alg id="foo">1. Foo.</emu-alg>
      ${M}<emu-xref href="foo" aoid="foo"></emu-xref>
      `,
      {
        ruleId: 'invalid-xref',
        nodeType: 'emu-xref',
        message: "xref can't have both href and aoid",
      }
    );
  });

  it('xref href not fragment', async () => {
    await assertError(
      positioned`
      ${M}<emu-xref href="http://example.com"></emu-xref>
      `,
      {
        ruleId: 'invalid-xref',
        nodeType: 'emu-xref',
        message:
          'xref to anything other than a fragment id is not supported (is "http://example.com"). try href="#sec-id" instead',
      }
    );
  });

  it('xref href not found', async () => {
    await assertError(
      positioned`
      <emu-xref href="${M}#foo"></emu-xref>
      `,
      {
        ruleId: 'xref-not-found',
        nodeType: 'emu-xref',
        message: 'can\'t find clause, production, note or example with id "foo"',
      }
    );
  });

  it('xref aoid not found', async () => {
    await assertError(
      positioned`
      <emu-xref aoid=${M}Foo></emu-xref>
      `,
      {
        ruleId: 'xref-not-found',
        nodeType: 'emu-xref',
        message: 'can\'t find abstract op with aoid "Foo"',
      }
    );
  });

  it('xref to step with contents', async () => {
    await assertError(
      positioned`
      <emu-alg>
        1. [id="step-foo"] Foo.
      </emu-alg>
      <emu-xref href="#step-foo">${M}Step 1.</emu-xref>
      `,
      {
        ruleId: 'step-xref-contents',
        nodeType: 'emu-xref',
        message: 'the contents of emu-xrefs to steps are ignored',
      }
    );
  });

  it('xref to step with contents, xref on multiple lines', async () => {
    await assertError(
      positioned`
      <emu-alg>
        1. [id="step-foo"] Foo.
      </emu-alg>
      <emu-xref
        href="#step-foo"
      >${M}Step 1.</emu-xref>
      `,
      {
        ruleId: 'step-xref-contents',
        nodeType: 'emu-xref',
        message: 'the contents of emu-xrefs to steps are ignored',
      }
    );
  });

  it('xref to large step number', async () => {
    await assertError(
      positioned`
      <emu-alg>
        1. Foo.
          1. Foo.
          1. Foo.
          1. Foo.
          1. Foo.
          1. Foo.
          1. Foo.
          1. Foo.
          1. Foo.
          1. Foo.
          1. Foo.
          1. Foo.
          1. Foo.
          1. Foo.
          1. Foo.
          1. Foo.
          1. Foo.
          1. Foo.
          1. Foo.
          1. Foo.
          1. Foo.
          1. Foo.
          1. Foo.
          1. Foo.
          1. Foo.
          1. Foo.
          1. Foo.
          1. Foo.
          1. Foo.
          1. [id="step-foo"] Foo.
      </emu-alg>
      <emu-xref href="${M}#step-foo"></emu-xref>
      `,
      {
        ruleId: 'high-step-number',
        nodeType: 'emu-xref',
        message:
          'ecmarkup does not know how to deal with step numbers as high as 29; if you need this, open an issue on ecmarkup',
      }
    );
  });
});
