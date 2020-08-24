'use strict';

let { assertLint, assertLintFree, positioned, lintLocationMarker: M } = require('./utils.js');

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
      }
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
      }
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
      }
    );
  });

  it('*0*', async () => {
    await assertLint(
      positioned`
        <emu-alg>1. If _x_ is ${M}*0*, then foo.</emu-alg>
      `,
      {
        ruleId: 'spelling',
        nodeType: 'html',
        message: 'the Number value 0 should be written "*+0*", to unambiguously exclude "*-0*"',
      }
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
        message: 'ECMA-262 uses Oxford spelling ("behaviour")',
      }
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
      }
    );
  });

  it('trailing whitespace', async () => {
    await assertLint(
      positioned`
        <p>something</p>${M} 
      `,
      {
        ruleId: 'spelling',
        nodeType: 'html',
        message: 'trailing spaces are not allowed',
      }
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
      }
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
      }
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
      }
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
      }
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
      }
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
      }
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
      }
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
      }
    );
  });

  it('leading whitespace within tags', async () => {
    await assertLint(
      positioned`
        <p>${M} This is an example.</p>
      `,
      {
        ruleId: 'spelling',
        nodeType: 'html',
        message: 'tags should not contain leading whitespace',
      }
    );
  });

  it('trailing whitespace within tags', async () => {
    await assertLint(
      positioned`
        <p>This is an example:${M} </p>
      `,
      {
        ruleId: 'spelling',
        nodeType: 'html',
        message: 'tags should not contain trailing whitespace',
      }
    );
  });

  it('negative', async () => {
    await assertLintFree(`
      <p>
        the *this* value
        one's complement
        two's complement
        *+0*
        *-0*
        *0*<sub>ℤ</sub>
        behaviour
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
    `);
  });
});
