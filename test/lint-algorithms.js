'use strict';

let { assertLint, assertLintFree, lintLocationMarker: M, positioned } = require('./utils.js');

const nodeType = 'emu-alg';

describe('linting algorithms', () => {
  describe('line style', () => {
    const ruleId = 'algorithm-line-style';

    it('simple', async () => {
      await assertLint(
        positioned`<emu-alg>
          1. testing${M}
        </emu-alg>`,
        {
          ruleId,
          nodeType,
          message: 'expected freeform line to end with "." (found "testing")',
        }
      );
    });

    it('labeled', async () => {
      await assertLint(
        positioned`<emu-alg>
          1. [id="step-test"] testing${M}
        </emu-alg>`,
        {
          ruleId,
          nodeType,
          message: 'expected freeform line to end with "." (found "testing")',
        }
      );
    });

    it('inline', async () => {
      await assertLint(positioned`<emu-alg>1. testing${M}</emu-alg>`, {
        ruleId,
        nodeType,
        message: 'expected freeform line to end with "." (found "testing")',
      });
    });

    it('repeat', async () => {
      await assertLint(
        positioned`<emu-alg>
          1. Let _x_ be a variable.
          1. Repeat, while _x_ < 10${M}
            1. Foo.
        </emu-alg>`,
        {
          ruleId,
          nodeType,
          message: 'expected "Repeat" to end with ","',
        }
      );
    });

    it('inline if', async () => {
      await assertLint(
        positioned`<emu-alg>
          1. Let _x_ be a variable.
          1. If _x_, then${M}
        </emu-alg>`,
        {
          ruleId,
          nodeType,
          message: 'expected "If" without substeps to end with "." or ":" (found ", then")',
        }
      );
    });

    it('inline if-then', async () => {
      await assertLint(
        positioned`<emu-alg>
          1. Let _x_ be a variable.
          1. If _x_, ${M}then do something.
        </emu-alg>`,
        {
          ruleId,
          nodeType,
          message: 'single-line "If" steps should not have a "then"',
        }
      );
    });

    it('multiline if', async () => {
      await assertLint(
        positioned`<emu-alg>
          1. Let _x_ be a variable.
          1. If _x_,${M}
            1. Foo.
        </emu-alg>`,
        {
          ruleId,
          nodeType,
          message: 'expected "If" with substeps to end with ", then" (found ",")',
        }
      );

      await assertLint(
        positioned`<emu-alg>
          1. Let _x_ be a variable.
          1. If _x_${M}; then
            1. Foo.
          </emu-alg>`,
        {
          ruleId,
          nodeType,
          message:
            'expected "If" with substeps to end with ", then" rather than "; then" when there are no other commas',
        }
      );
    });

    it('else if', async () => {
      await assertLint(
        positioned`<emu-alg>
          1. Let _x_ and _y_ be variables.
          1. If _x_, foo.
          1. Else${M}, if _y_, bar.
        </emu-alg>`,
        {
          ruleId,
          nodeType,
          message: 'prefer "Else if" over "Else, if"',
        }
      );
    });

    it('NOTE:', async () => {
      await assertLint(
        positioned`<emu-alg>
          1. NOTE: ${M}foo.
        </emu-alg>`,
        {
          ruleId,
          nodeType,
          message: 'the clause after "NOTE:" should begin with a capital letter',
        }
      );

      await assertLint(
        positioned`<emu-alg>
          1. ${M}Note: Foo.
        </emu-alg>`,
        {
          ruleId,
          nodeType,
          message: '"NOTE:" should be fully capitalized',
        }
      );

      await assertLint(
        positioned`<emu-alg>
          1. NOTE: Foo${M}
        </emu-alg>`,
        {
          ruleId,
          nodeType,
          message: 'expected freeform line to end with "." (found "NOTE: Foo")',
        }
      );
    });

    it('Assert:', async () => {
      await assertLint(
        positioned`<emu-alg>
          1. Assert: ${M}foo.
        </emu-alg>`,
        {
          ruleId,
          nodeType,
          message: 'the clause after "Assert:" should begin with a capital letter',
        }
      );

      await assertLint(
        positioned`<emu-alg>
          1. ${M}ASSERT: Foo.
        </emu-alg>`,
        {
          ruleId,
          nodeType,
          message: '"Assert:" should be capitalized',
        }
      );

      await assertLint(
        positioned`<emu-alg>
          1. Assert: Foo${M}
        </emu-alg>`,
        {
          ruleId,
          nodeType,
          message: 'expected freeform line to end with "." (found "Assert: Foo")',
        }
      );
    });

    it('pre', async () => {
      await assertLint(
        positioned`<emu-alg>
            1. ${M}Let _constructorText_ be the source text
            <pre><code class="javascript">constructor() {}</code></pre>
              1. Foo.
            1. Use _constructorText_.
        </emu-alg>`,
        {
          ruleId,
          nodeType,
          message: 'lines ending in <pre> tags must not have substeps',
        }
      );
    });

    it('rules still apply to ignored whole-line tags', async () => {
      await assertLint(positioned`<emu-alg>1. <mark>testing${M}</mark></emu-alg>`, {
        ruleId,
        nodeType,
        message: 'expected freeform line to end with "." (found "testing")',
      });
    });

    it('negative', async () => {
      await assertLintFree(`
        <emu-alg>
          1. Let _x_, _y_, and _z_ be variables.
          1. If foo, bar.
          1. Else if foo, bar.
          1. Else, bar.
          1. If foo, then
            1. Substep.
          1. If _x_, _y_, or _z_; then
            1. Substep.
          1. Else if foo, then
            1. Substep.
          1. Else,
            1. Substep.
          1. Repeat,
            1. Substep.
          1. Repeat, while foo,
            1. Substep.
          1. Repeat, until foo,
            1. Substep.
          1. For each foo, do bar.
          1. For each foo, do
            1. Substep.
          1. NOTE: Foo.
          1. NOTE: The following algorithm returns *true*:
            1. Return *true*.
          1. Assert: Foo.
          1. Assert: The following algorithm returns *true*:
            1. Return *true*.
          1. Other.
          1. Other:
            1. Substep.
          1. Let _constructorText_ be the source text
          <pre><code class="javascript">constructor() {}</code></pre>
          1. Let _parse_ be a method.
          1. Let _constructor_ be a variable.
          1. Set _constructor_ to _parse_(_constructorText_).
          1. <mark>A highlighted line.</mark>
          1. <ins>Amend the spec with this.</ins>
          1. <del>Remove this from the spec.</del>
          1. <del><mark>Nested tag.</mark></del>
          1. <ins>Nested <mark>tag</mark>.</ins>
        </emu-alg>
      `);
    });
  });

  describe('step numbering', () => {
    const ruleId = 'algorithm-step-numbering';

    it('simple', async () => {
      await assertLint(
        positioned`<emu-alg>
          ${M}2. Step.
          1. Step.
        </emu-alg>`,
        {
          ruleId,
          nodeType,
          message: 'expected step number to be "1." (found "2.")',
        }
      );
      await assertLint(
        positioned`<emu-alg>
          1. Step.
          ${M}2. Step.
        </emu-alg>`,
        {
          ruleId,
          nodeType,
          message: 'expected step number to be "1." (found "2.")',
        }
      );
      await assertLint(
        positioned`<emu-alg>
          1. Step.
          1. Step.
          ${M}2. Step.
        </emu-alg>`,
        {
          ruleId,
          nodeType,
          message: 'expected step number to be "1." (found "2.")',
        }
      );
    });

    it('nested', async () => {
      await assertLint(
        positioned`<emu-alg>
          1. Step:
            ${M}2. Substep.
        </emu-alg>`,
        {
          ruleId,
          nodeType,
          message: 'expected step number to be "1." (found "2.")',
        }
      );

      await assertLint(
        positioned`<emu-alg>
          1. Step:
            ${M}2. Substep.
        </emu-alg>`,
        {
          ruleId,
          nodeType,
          message: 'expected step number to be "1." (found "2.")',
        }
      );

      await assertLint(
        positioned`<emu-alg>
          1. Step:
            1. Substep.
            ${M}2. Substep.
        </emu-alg>`,
        {
          ruleId,
          nodeType,
          message: 'expected step number to be "1." (found "2.")',
        }
      );
    });

    it('ten', async () => {
      await assertLint(
        positioned`<emu-alg>
          1. Step.
          ${M}10. Step.
        </emu-alg>`,
        {
          ruleId,
          nodeType,
          message: 'expected step number to be "1." (found "10.")',
        }
      );
    });

    it('negative', async () => {
      await assertLintFree(`
        <emu-alg>
          1. Step.
          1. Step.
          1. Step.
        </emu-alg>
      `);
    });
  });

  describe('step labels', () => {
    const ruleId = 'algorithm-step-labels';
    it('rejects unprefixed labels', async () => {
      await assertLint(
        positioned`<emu-alg>
          1. [id="${M}example"] Step.
        </emu-alg>`,
        {
          ruleId,
          nodeType,
          message: 'step labels should start with "step-"',
        }
      );
    });

    it('negative', async () => {
      await assertLintFree(`
        <emu-alg>
          1. Step.
          1. [id="step-example"] Step.
          1. This is <span id="example">valid</span>.
        </emu-alg>
      `);
    });
  });

  describe('step attributes', () => {
    const ruleId = 'unknown-step-attribute';
    it('rejects unknown attributes', async () => {
      await assertLint(
        positioned`<emu-alg>
          1. [id="step-id",${M}unknown="foo"] Step.
        </emu-alg>`,
        {
          ruleId,
          nodeType,
          message: 'unknown step attribute "unknown"',
        }
      );
    });
  });

  describe('for each element', () => {
    const ruleId = 'for-each-element';
    it('rejects loops without types', async () => {
      await assertLint(
        positioned`
        <emu-alg>
          1. Let _y_ be a List.
          1. For each ${M}_x_ of _y_, do foo.
        </emu-alg>`,
        {
          ruleId,
          nodeType,
          message: 'expected "for each" to have a type name or "element" before the loop variable',
        }
      );
    });

    it('negative', async () => {
      await assertLintFree(`
        <emu-alg>
          1. Let _y_ be a List.
          1. Let _S_ be a Set.
          1. For each String _x_ of _y_, do foo.
          1. For each element _x_ of _y_, do foo.
          1. For each integer _x_ such that _x_ &in; _S_, do foo.
        </emu-alg>
      `);
    });
  });
});
