import { describe, it } from 'node:test';
import { assertLint, assertLintFree, positioned, lintLocationMarker as M } from './utils.js';

describe('spelling', () => {
  it('*this* object', async () => {
    await assertLint(
      positioned`
        <p>If the ${M}*this* object ...</p>
      `,
      {
        ruleId: 'spelling',
        nodeType: 'html',
        message: 'prefer "*this* value"',
      },
    );
  });

  it("1's complement", async () => {
    await assertLint(
      positioned`
        <p>It returns the ${M}1's complement of _x_.</p>
      `,
      {
        ruleId: 'spelling',
        nodeType: 'html',
        message: 'prefer "one\'s complement"',
      },
    );
  });

  it("2's complement", async () => {
    await assertLint(
      positioned`
        <p>BigInts act as ${M}2's complement binary strings</p>
      `,
      {
        ruleId: 'spelling',
        nodeType: 'html',
        message: 'prefer "two\'s complement"',
      },
    );
  });

  it('*0*', async () => {
    await assertLint(
      positioned`
        <emu-alg>
          1. Let _x_ be a value.
          1. If _x_ is ${M}*0*<sub>𝔽</sub>, do foo.
        </emu-alg>
      `,
      {
        ruleId: 'spelling',
        nodeType: 'html',
        message: 'the Number value 0 should be written "*+0*", to unambiguously exclude "*-0*"',
      },
    );
  });

  it('numeric literal bolding', async () => {
    await assertLint(
      positioned`
        <p>${M}+&infin;<sub>𝔽</sub></p>
      `,
      {
        ruleId: 'spelling',
        nodeType: 'html',
        message: 'literal Number values should be bolded',
      },
    );

    await assertLint(
      positioned`
        <p>${M}42<sub>𝔽</sub></p>
      `,
      {
        ruleId: 'spelling',
        nodeType: 'html',
        message: 'literal Number values should be bolded',
      },
    );

    await assertLint(
      positioned`
        <p>${M}0xDEADBEEF<sub>𝔽</sub></p>
      `,
      {
        ruleId: 'spelling',
        nodeType: 'html',
        message: 'literal Number values should be bolded',
      },
    );

    await assertLint(
      positioned`
        <p>${M}-1<sub>ℤ</sub></p>
      `,
      {
        ruleId: 'spelling',
        nodeType: 'html',
        message: 'literal BigInt values should be bolded',
      },
    );
  });

  it('numeric literal subscripts', async () => {
    await assertLint(
      positioned`
        <p>${M}*+&infin;*</p>
      `,
      {
        ruleId: 'spelling',
        nodeType: 'html',
        message:
          'literal Number or BigInt values should be followed by <sub>𝔽</sub> or <sub>ℤ</sub> respectively',
      },
    );

    await assertLint(
      positioned`
        <p>${M}*42*</p>
      `,
      {
        ruleId: 'spelling',
        nodeType: 'html',
        message:
          'literal Number or BigInt values should be followed by <sub>𝔽</sub> or <sub>ℤ</sub> respectively',
      },
    );

    await assertLint(
      positioned`
        <p>${M}*0xDEADBEEF*</p>
      `,
      {
        ruleId: 'spelling',
        nodeType: 'html',
        message:
          'literal Number or BigInt values should be followed by <sub>𝔽</sub> or <sub>ℤ</sub> respectively',
      },
    );
  });

  it('leading plus sign', async () => {
    await assertLint(
      positioned`
        <p>*${M}+1*<sub>𝔽</sub></p>
      `,
      {
        ruleId: 'spelling',
        nodeType: 'html',
        message: 'positive numeric values other than 0 should not have a leading plus sign (+)',
      },
    );

    await assertLint(
      positioned`
        <p>*${M}+0xDEADBEEF*<sub>𝔽</sub></p>
      `,
      {
        ruleId: 'spelling',
        nodeType: 'html',
        message: 'positive numeric values other than 0 should not have a leading plus sign (+)',
      },
    );

    await assertLint(
      positioned`
        <p>_x_ is ${M}+1</p>
      `,
      {
        ruleId: 'spelling',
        nodeType: 'html',
        message: 'positive real numbers should not have a leading plus sign (+)',
      },
    );

    await assertLint(
      positioned`
        <p>_x_ is ${M}+*1*<sub>𝔽</sub></p>
      `,
      {
        ruleId: 'spelling',
        nodeType: 'html',
        message: 'the sign character for a numeric literal should be within the `*`s',
      },
    );

    await assertLint(
      positioned`
        <p>_x_ is ${M}-*1*<sub>𝔽</sub></p>
      `,
      {
        ruleId: 'spelling',
        nodeType: 'html',
        message: 'the sign character for a numeric literal should be within the `*`s',
      },
    );
  });

  it('&infin;', async () => {
    await assertLint(
      positioned`
        <p>${M}&infin;</p>
      `,
      {
        ruleId: 'spelling',
        nodeType: 'html',
        message: '&infin; should always be written with a leading + or -',
      },
    );
  });

  it('mathematical value of/number value for', async () => {
    await assertLint(
      positioned`
        <p>Let _x_ be the mathematical value ${M}for _y_.</p>
      `,
      {
        ruleId: 'spelling',
        nodeType: 'html',
        message: 'the mathematical value "of", not "for"',
      },
    );

    await assertLint(
      positioned`
        <p>Let _x_ be the Number value ${M}of _y_.</p>
      `,
      {
        ruleId: 'spelling',
        nodeType: 'html',
        message: 'the Number value "for", not "of"',
      },
    );

    await assertLint(
      positioned`
        <p>Let _x_ be the ${M}number value for _y_.</p>
      `,
      {
        ruleId: 'spelling',
        nodeType: 'html',
        message: '"Number value", not "number value"',
      },
    );
  });

  it('behavior', async () => {
    await assertLint(
      positioned`
        <p>Most hosts will be able to simply define HostGetImportMetaProperties, and leave HostFinalizeImportMeta with its default ${M}behavior.</p>
      `,
      {
        ruleId: 'spelling',
        nodeType: 'html',
        message: 'Ecma uses Oxford spelling ("behaviour", etc.)',
      },
    );
  });

  it('indexes', async () => {
    await assertLint(
      positioned`
        <p>Array ${M}indexes are a particular kind of index.</p>
      `,
      {
        ruleId: 'spelling',
        nodeType: 'html',
        message: 'prefer "indices"',
      },
    );
  });

  it('nonnegative', async () => {
    await assertLint(
      positioned`
        <p>a ${M}nonnegative integer</p>
      `,
      {
        ruleId: 'spelling',
        nodeType: 'html',
        message: 'prefer "non-negative"',
      },
    );
  });

  it('nonempty', async () => {
    await assertLint(
      positioned`
        <p>a ${M}nonempty List</p>
      `,
      {
        ruleId: 'spelling',
        nodeType: 'html',
        message: 'prefer "non-empty"',
      },
    );
  });

  it('nonzero', async () => {
    await assertLint(
      positioned`
        <p>a ${M}nonzero integer</p>
      `,
      {
        ruleId: 'spelling',
        nodeType: 'html',
        message: 'prefer "non-zero"',
      },
    );
  });

  it('the empty string', async () => {
    await assertLint(
      positioned`
        <p>_searchValue_ is ${M}the empty string</p>
      `,
      {
        ruleId: 'spelling',
        nodeType: 'html',
        message: 'prefer "the empty String"',
      },
    );
  });

  it('trailing whitespace', async () => {
    await assertLint(
      positioned`
        <p>something</p>${M} \n`, // escaped linebreak so editors do not try to remove this
      {
        ruleId: 'spelling',
        nodeType: 'html',
        message: 'trailing spaces are not allowed',
      },
    );
  });

  it('two blank lines', async () => {
    await assertLint(
      positioned`
<p></p>

${M}
<p></p>
      `,
      {
        ruleId: 'spelling',
        nodeType: 'html',
        message: 'no more than one blank line is allowed',
      },
    );

    await assertLint(
      positioned`
<p></p>

${M}

<p></p>
      `,
      {
        ruleId: 'spelling',
        nodeType: 'html',
        message: 'no more than one blank line is allowed',
      },
    );
  });

  it('header linebreak', async () => {
    await assertLint(
      positioned`
<emu-clause id="example">
${M}
  <h1>Example</h1>
</emu-clause>
      `,
      {
        ruleId: 'spelling',
        nodeType: 'html',
        message: "there should not be a blank line between a clause's opening tag and its header",
      },
    );
  });

  it('footer linebreak', async () => {
    await assertLint(
      positioned`
<emu-clause id="example">
  <h1>Example</h1>
${M}
</emu-clause>
      `,
      {
        ruleId: 'spelling',
        nodeType: 'html',
        message:
          'there should not be a blank line between the last line of a clause and its closing tag',
      },
    );
  });

  it('CR', async () => {
    await assertLint(
      positioned`
windows:${M}\r
      `,
      {
        ruleId: 'spelling',
        nodeType: 'html',
        message: 'only Unix-style (LF) linebreaks are allowed',
      },
    );
  });

  it('step numbers', async () => {
    await assertLint(
      positioned`
        Something about step ${M}1.
      `,
      {
        ruleId: 'spelling',
        nodeType: 'html',
        message: 'prefer using labeled steps and <emu-xref> tags over hardcoding step numbers',
      },
    );
  });

  it('clause numbers', async () => {
    await assertLint(
      positioned`
        See clause ${M}1.
      `,
      {
        ruleId: 'spelling',
        nodeType: 'html',
        message:
          'clauses should be referenced using <emu-xref> tags rather than hardcoding clause numbers',
      },
    );
  });

  it('multiple internal spaces', async () => {
    await assertLint(
      positioned`
        I am writing on a typewriter.${M}  In the 21st century, for some reason.
      `,
      {
        ruleId: 'spelling',
        nodeType: 'html',
        message: 'multiple consecutive spaces are not allowed',
      },
    );
  });

  it('comparison with *+/-0*', async () => {
    await assertLint(
      positioned`
        <p>If _x_ &lt; *${M}+0*<sub>𝔽</sub></p>
      `,
      {
        ruleId: 'spelling',
        nodeType: 'html',
        message: '"less than" comparisons against floating-point zero should use negative zero',
      },
    );

    await assertLint(
      positioned`
        <p>If _x_ &gt; *${M}-0*<sub>𝔽</sub></p>
      `,
      {
        ruleId: 'spelling',
        nodeType: 'html',
        message: '"greater than" comparisons against floating-point zero should use positive zero',
      },
    );

    await assertLint(
      positioned`
        <p>If _x_ &le; *${M}-0*<sub>𝔽</sub></p>
      `,
      {
        ruleId: 'spelling',
        nodeType: 'html',
        message:
          'comparisons against floating-point zero should use strict comparisons (< or >); guard the equals case with "is"',
      },
    );

    await assertLint(
      positioned`
        <p>If _x_ &ge; *${M}+0*<sub>𝔽</sub></p>
      `,
      {
        ruleId: 'spelling',
        nodeType: 'html',
        message:
          'comparisons against floating-point zero should use strict comparisons (< or >); guard the equals case with "is"',
      },
    );
  });

  it('divison', async () => {
    await assertLint(
      positioned`
        <p>1 ${M}&divide; 2</p>
      `,
      {
        ruleId: 'spelling',
        nodeType: 'html',
        message: 'division should be written as "/", not "÷", per ISO 80000-2',
      },
    );

    await assertLint(
      positioned`
        <p>1 ${M}÷ 2</p>
      `,
      {
        ruleId: 'spelling',
        nodeType: 'html',
        message: 'division should be written as "/", not "÷", per ISO 80000-2',
      },
    );
  });

  it('negative', async () => {
    await assertLintFree(`
      <p>
        the *this* value
        one's complement
        two's complement
        *0xDEADBEEF*<sub>𝔽</sub>
        *1*<sub>𝔽</sub>
        +&infin;
        -&infin;
        *+&infin;*<sub>𝔽</sub>
        *+0*<sub>𝔽</sub>
        *+0x0*<sub>𝔽</sub>
        *-0*<sub>𝔽</sub>
        *0*<sub>ℤ</sub>
        0
        +000000-01-01T00:00:00Z
        +275760-09-13T00:00:00Z
        +00:00
        behaviour
        array indices
        a non-negative integer
        a non-zero integer
        Let _x_ be the mathematical value of _y_.
        Let _y_ be the Number value for _x_.
        IsNonNegativeInteger(_x_)
        the empty String
      </p>
      <p>One blank line is fine:</p>

      <p></p>
      <emu-clause id="example">
        <h1>Example</h1>
      </emu-clause>

      <emu-alg>
        1. [id="step-label"] Foo.
      </emu-alg>
      <p>Something about step <emu-xref href="#step-label"></emu-xref>.</p>
      <p>See clause <emu-xref href="#example"></emu-xref>.</p>

      <table><tr><td>Spaces for aligning table cells are acceptable.</td>
      <td> For example, it is nice for these to line up.            </td>
      <td> Also to pad them a bit, in some cases.                   </td>
      </tr></table>
      <p>
        Spaces in <ins>insertions and </ins>deletions<del> and other edits</del>
        are also fine.
      </p>

      <p>
        Paragraphs with the open/close tags on their own line are OK.
      </p>

      <p>Comparisons with appropriately-signed zero are OK: _x_ &lt; *-0*<sub>𝔽</sub>, _x_ &gt; *+0*<sub>𝔽</sub>.</p>

    `);
  });
});
