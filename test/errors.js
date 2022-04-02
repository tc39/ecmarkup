'use strict';

let assert = require('assert');
let emu = require('../lib/ecmarkup');

let { lintLocationMarker: M, positioned, assertError, assertErrorFree } = require('./utils.js');

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
      },
      {
        asImport: false,
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
      <emu-xref href="${M}http://example.com"></emu-xref>
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

  it('ecmarkdown failed: fragment', async () => {
    await assertError(
      positioned`
      <p>
      text:${M}

      more text.
      </p>
      `,
      {
        ruleId: 'invalid-emd',
        nodeType: 'text',
        message: 'ecmarkdown failed to parse: Unexpected token parabreak; expected EOF',
      }
    );
  });

  it('ecmarkdown failed: table', async () => {
    await assertError(
      positioned`
      <emu-table>
        <table>
          <tr>
          <td>
          Some text${M}

          <p>Another paragraph</p>
          </td>
          </tr>
        </table>
      </emu-table>
      `,
      {
        ruleId: 'invalid-emd',
        nodeType: 'text',
        message: 'ecmarkdown failed to parse: Unexpected token parabreak; expected EOF',
      }
    );
  });

  it('ecmarkdown failed: example', async () => {
    await assertError(
      positioned`
      <emu-example>
        Some text${M}

        <p>Another paragraph</p>
      </emu-example>
      `,
      {
        ruleId: 'invalid-emd',
        nodeType: 'text',
        message: 'ecmarkdown failed to parse: Unexpected token parabreak; expected EOF',
      }
    );
  });

  it('ecmarkdown failed: equation', async () => {
    await assertError(
      positioned`
      <emu-eqn>text:${M}

      more text.</emu-eqn>
      `,
      {
        ruleId: 'invalid-emd',
        nodeType: 'emu-eqn',
        message: 'ecmarkdown failed to parse: Unexpected token parabreak; expected EOF',
      }
    );
  });

  it('ecmarkdown failed: algorithm', async () => {
    await assertError(
      positioned`
      <emu-alg>${M}This is not an algrithm</emu-alg>
      `,
      {
        ruleId: 'invalid-emd',
        nodeType: 'emu-alg',
        message: 'ecmarkdown failed to parse: Unexpected token text; expected ol',
      }
    );
  });

  it('ecmarkdown failed: algorithm with linting enabled', async () => {
    await assertError(
      positioned`
      <emu-alg>${M}This is not an algrithm</emu-alg>
      `,
      {
        ruleId: 'invalid-emd',
        nodeType: 'emu-alg',
        message: 'ecmarkdown failed to parse: Unexpected token text; expected ol',
      },
      { lintSpec: true }
    );
  });

  it('error in nested import', async () => {
    let warnings = [];

    let { line, column, html } = positioned`
      <emu-clause id="example">
        <h1>Title</h1>
        <emu-note type="${M}unknown"></emu-note>
      </emu-clause>
    `;
    let fetch = name => {
      switch (name.replace(/\\/g, '/')) {
        case 'foo/index.html': {
          return `<emu-import href="bar/one.html"></emu-import>`;
        }
        case 'foo/bar/one.html': {
          return `<emu-import href="../../baz/two.html"></emu-import>`;
        }
        case 'baz/two.html': {
          return html;
        }
        default: {
          throw new Error('unexpected file ' + name);
        }
      }
    };
    await emu.build('foo/index.html', fetch, {
      ecma262Biblio: false,
      copyright: false,
      warn: e =>
        warnings.push({
          ruleId: e.ruleId,
          nodeType: e.nodeType,
          line: e.line,
          column: e.column,
          message: e.message,
          file: e.file.replace(/\\/g, '/'),
          source: e.source,
        }),
    });

    assert.deepStrictEqual(warnings, [
      {
        ruleId: 'invalid-note',
        nodeType: 'emu-note',
        message: 'unknown note type "unknown"',
        line,
        column,
        file: 'baz/two.html',
        source: line == null ? undefined : html,
      },
    ]);
  });

  it('missing header', async () => {
    await assertError(
      positioned`
        ${M}<emu-clause id="sec-test" type="abstract operation">
        </emu-clause>
      `,
      {
        ruleId: 'missing-header',
        nodeType: 'emu-clause',
        message: 'could not locate header element',
      },
      { lintSpec: true }
    );

    await assertError(
      positioned`
        <emu-clause id="sec-test" type="abstract operation">
        ${M}<p></p>
        </emu-clause>
      `,
      {
        ruleId: 'missing-header',
        nodeType: 'p',
        message: 'could not locate header element; found <p> before any <h1>',
      },
      { lintSpec: true }
    );
  });

  it('numeric method name formatting', async () => {
    await assertError(
      positioned`
        <emu-clause id="sec-test" type="numeric method">
        <h1>${M}Foo ( )</h1>
        <dl class='header'>
        </dl>
        </emu-clause>
      `,
      {
        ruleId: 'numeric-method-for',
        nodeType: 'h1',
        message: 'numeric methods should be of the form `Type::operation`',
      },
      { lintSpec: true }
    );
  });

  describe('structured header', () => {
    it('header is not parseable', async () => {
      await assertError(
        positioned`
          <emu-clause id="sec-test" type="abstract operation">
          <h1>
          Some ${M}Example (
          )
          </h1>
          <dl class='header'>
          </dl>
          </emu-clause>
        `,
        {
          ruleId: 'header-format',
          nodeType: 'h1',
          message: 'expected `(`',
        },
        { lintSpec: true }
      );
    });

    it('parameter is not parseable', async () => {
      await assertError(
        positioned`
          <emu-clause id="sec-test" type="abstract operation">
          <h1>
          Example (
            x: a number,
            y: a number,
            z${M},
          )
          </h1>
          <dl class='header'>
          </dl>
          </emu-clause>
        `,
        {
          ruleId: 'header-format',
          nodeType: 'h1',
          message: 'expected `:`',
        },
        { lintSpec: true }
      );
    });

    it('required parameter after optional', async () => {
      await assertError(
        positioned`
          <emu-clause id="sec-test" type="abstract operation">
          <h1>
          Example (
            optional x: a number,
            ${M}y: a number,
          )
          </h1>
          <dl class='header'>
          </dl>
          </emu-clause>
        `,
        {
          ruleId: 'header-format',
          nodeType: 'h1',
          message: 'required parameters should not follow optional parameters',
        },
        { lintSpec: true }
      );
    });

    it('unexpected element in dl', async () => {
      await assertError(
        positioned`
          <emu-clause id="sec-test" type="abstract operation">
          <h1>Example ( )</h1>
          <dl class='header'>
            ${M}<p></p>
          </dl>
          </emu-clause>
        `,
        {
          ruleId: 'header-format',
          nodeType: 'p',
          message: 'expecting header to have DT, but found P',
        },
        { lintSpec: true }
      );
    });

    it('duplicate items in dl', async () => {
      await assertError(
        positioned`
          <emu-clause id="sec-test" type="abstract operation">
          <h1>Example ( )</h1>
          <dl class='header'>
            <dt>description</dt>
            <dd>Foo.</dd>
            ${M}<dt>description</dt>
            <dd>Foo.</dd>
            </dl>
          </emu-clause>
        `,
        {
          ruleId: 'header-format',
          nodeType: 'dt',
          message: 'duplicate "description" attribute',
        },
        { lintSpec: true }
      );

      await assertError(
        positioned`
          <emu-clause id="sec-test" type="concrete method">
          <h1>Example ( )</h1>
          <dl class='header'>
            <dt>for</dt>
            <dd>Something</dd>
            ${M}<dt>for</dt>
            <dd>Something</dd>
            </dl>
          </emu-clause>
        `,
        {
          ruleId: 'header-format',
          nodeType: 'dt',
          message: 'duplicate "for" attribute',
        },
        { lintSpec: true }
      );

      await assertError(
        positioned`
          <emu-clause id="sec-test" type="abstract operation">
          <h1>Example ( )</h1>
          <dl class='header'>
            <dt>redefinition</dt>
            <dd>true</dd>
            ${M}<dt>redefinition</dt>
            <dd>false</dd>
            </dl>
          </emu-clause>
        `,
        {
          ruleId: 'header-format',
          nodeType: 'dt',
          message: 'duplicate "redefinition" attribute',
        },
        { lintSpec: true }
      );
    });

    it('"for" for AO', async () => {
      await assertError(
        positioned`
          <emu-clause id="sec-test" type="abstract operation">
          <h1>Example ( )</h1>
          <dl class='header'>
            ${M}<dt>for</dt>
            <dd>Something</dd>
          </dl>
          </emu-clause>
        `,
        {
          ruleId: 'header-format',
          nodeType: 'dt',
          message: '"for" attributes only apply to concrete or internal methods',
        },
        { lintSpec: true }
      );
    });

    it('missing "for" for concrete method', async () => {
      await assertError(
        positioned`
          <emu-clause id="sec-test" type="concrete method">
          <h1>Example ( )</h1>
          <dl class='header'>${M}
          </dl>
          </emu-clause>
        `,
        {
          ruleId: 'header-format',
          nodeType: 'dl',
          message: 'expected concrete method to have a "for"',
        },
        { lintSpec: true }
      );
    });

    it('unknown value for redefinition', async () => {
      await assertError(
        positioned`
          <emu-clause id="sec-test" type="abstract operation">
          <h1>Example ( )</h1>
          <dl class='header'>
            <dt>redefinition</dt>
            <dd>${M}not true</dd>
          </dl>
          </emu-clause>
        `,
        {
          ruleId: 'header-format',
          nodeType: 'dd',
          message:
            'unknown value for "redefinition" attribute (expected "true" or "false", got "not true")',
        },
        { lintSpec: true }
      );
    });

    it('empty attribute', async () => {
      await assertError(
        positioned`
          <emu-clause id="sec-test" type="abstract operation">
          <h1>Example ( )</h1>
          <dl class='header'>
            ${M}<dt></dt>
            <dd>Something</dd>
          </dl>
          </emu-clause>
        `,
        {
          ruleId: 'header-format',
          nodeType: 'dt',
          message: 'missing value for structured header attribute',
        },
        { lintSpec: true }
      );
    });

    it('unknown attribute', async () => {
      await assertError(
        positioned`
          <emu-clause id="sec-test" type="abstract operation">
          <h1>Example ( )</h1>
          <dl class='header'>
            ${M}<dt>unknown</dt>
            <dd>Something</dd>
          </dl>
          </emu-clause>
        `,
        {
          ruleId: 'header-format',
          nodeType: 'dt',
          message: 'unknown structured header entry type "unknown"',
        },
        { lintSpec: true }
      );
    });

    it('missing clause type', async () => {
      await assertError(
        positioned`
          ${M}<emu-clause id="sec-test">
          <h1>Example ( )</h1>
          <dl class='header'>
          </dl>
          </emu-clause>
        `,
        {
          ruleId: 'header-type',
          nodeType: 'emu-clause',
          message: 'clauses with structured headers should have a type',
        },
        { lintSpec: true }
      );
    });

    it('unknown clause type', async () => {
      await assertError(
        positioned`
          <emu-clause id="sec-test" type="${M}unknown">
          <h1>Example ( )</h1>
          <dl class='header'>
          </dl>
          </emu-clause>
        `,
        {
          ruleId: 'header-type',
          nodeType: 'emu-clause',
          message: 'unknown clause type "unknown"',
        },
        { lintSpec: true }
      );
    });

    it('extra AOID', async () => {
      await assertError(
        positioned`
          <emu-clause id="sec-test" type="abstract operation" ${M}aoid="Whatever">
          <h1>Foo ( )</h1>
          <dl class='header'>
          </dl>
          </emu-clause>
        `,
        {
          ruleId: 'header-format',
          nodeType: 'emu-clause',
          message: 'nodes with structured headers should not include an AOID',
        },
        { lintSpec: true }
      );
    });
  });

  it('empty return types', async () => {
    await assertError(
      positioned`
        <emu-clause id="sec-test" type="abstract operation">
        <h1>Foo ( ):${M}</h1>
        <dl class='header'>
        </dl>
        </emu-clause>
      `,
      {
        ruleId: 'header-format',
        nodeType: 'h1',
        message: 'if a return type is given, it must not be empty',
      },
      { lintSpec: true }
    );
  });

  it('clause after annex', async () => {
    await assertError(
      positioned`
       <emu-annex id="sec-a">
        <h1>Annex</h1>
        </emu-annex>
        ${M}<emu-clause id="sec-c">
          <h1>Clause</h1>
        </emu-clause>
      `,
      {
        ruleId: 'clause-after-annex',
        nodeType: 'emu-clause',
        message: 'clauses cannot follow annexes',
      }
    );
  });

  it('nested annex', async () => {
    await assertError(
      positioned`
        <emu-clause id="sec-c">
          <h1>Clause</h1>
          ${M}<emu-annex id="sec-a">
            <h1>Annex</h1>
          </emu-annex>
        </emu-clause>
      `,
      {
        ruleId: 'annex-depth',
        nodeType: 'emu-annex',
        message: 'first annex must be at depth 0',
      }
    );
  });

  it('biblio missing href', async () => {
    await assertError(
      positioned`
        ${M}<emu-biblio></emu-biblio>
      `,
      {
        ruleId: 'biblio-href',
        nodeType: 'emu-biblio',
        message: 'emu-biblio elements must have an href attribute',
      },
      { asImport: false }
    );
  });

  it('biblio in import', async () => {
    await assertError(
      positioned`
        ${M}<emu-biblio></emu-biblio>
      `,
      {
        ruleId: 'biblio-in-import',
        nodeType: 'emu-biblio',
        message: 'emu-biblio elements cannot be used within emu-imports',
      },
      { asImport: 'only' }
    );

    await assertError(
      positioned`
        <span></span>
        <div>
          ${M}<emu-biblio></emu-biblio>
        </div>
      `,
      {
        ruleId: 'biblio-in-import',
        nodeType: 'emu-biblio',
        message: 'emu-biblio elements cannot be used within emu-imports',
      },
      { asImport: 'only' }
    );
  });

  describe('SDO defined over unknown production', () => {
    it('unknown production', async () => {
      await assertError(
        positioned`
          <emu-clause id="sec-example" type="sdo">
            <h1>Static Semantics: Example</h1>
            <dl class='header'></dl>
            ${M}<emu-grammar>
              Foo : \`a\`
            </emu-grammar>
            <emu-alg>
              1. Return *true*.
            </emu-alg>
          </emu-clause>
        `,
        {
          ruleId: 'grammar-shape',
          nodeType: 'emu-grammar',
          message: 'could not find definition corresponding to production Foo',
        }
      );
    });

    it('unknown rhs', async () => {
      await assertError(
        positioned`
          <emu-grammar type="definition">
            Foo : \`b\`
          </emu-grammar>

          <emu-clause id="sec-example" type="sdo">
            <h1>Static Semantics: Example</h1>
            <dl class='header'></dl>
            ${M}<emu-grammar>
              Foo : \`a\`
            </emu-grammar>
            <emu-alg>
              1. Return *true*.
            </emu-alg>
          </emu-clause>
        `,
        {
          ruleId: 'grammar-shape',
          nodeType: 'emu-grammar',
          message: 'could not find definition for rhs a',
        }
      );
    });

    it('negative', async () => {
      await assertErrorFree(`
        <emu-grammar type="definition">
          Foo : \`a\`
        </emu-grammar>

        <emu-clause id="sec-example" type="sdo">
          <h1>Static Semantics: Example</h1>
          <dl class='header'></dl>
          <emu-grammar>
            Foo : \`a\`
          </emu-grammar>
          <emu-alg>
            1. Return *true*.
          </emu-alg>
        </emu-clause>
      `);
    });
  });
});
