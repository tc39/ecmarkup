'use strict';

let { assertLint, assertLintFree, lintLocationMarker: M, positioned } = require('./lint-helpers');

const nodeType = 'EMU-ALG';

describe('linting algorithms', function () {
  describe('line endings', function () {
    const ruleId = 'algorithm-line-endings';

    it('simple', async function () {
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

    it('inline', async function () {
      await assertLint(positioned`<emu-alg>1. testing${M}</emu-alg>`, {
        ruleId,
        nodeType,
        message: 'expected freeform line to end with "." (found "testing")',
      });
    });

    it('repeat', async function () {
      await assertLint(
        positioned`<emu-alg>
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

    it('inline if', async function () {
      await assertLint(
        positioned`<emu-alg>
          1. If _x_, then${M}
        </emu-alg>`,
        {
          ruleId,
          nodeType,
          message: 'expected "If" without substeps to end with "." or ":" (found ", then")',
        }
      );
    });

    it('multiline if', async function () {
      await assertLint(
        positioned`<emu-alg>
          1. If _x_,${M}
            1. Foo.
        </emu-alg>`,
        {
          ruleId,
          nodeType,
          message: 'expected "If" with substeps to end with ", then" (found ",")',
        }
      );
    });

    it('pre', async function () {
      await assertLint(
        positioned`<emu-alg>
            1. ${M}Let _constructorText_ be the source text
            <pre><code class="javascript">constructor() {}</code></pre>
              1. Foo.
        </emu-alg>`,
        {
          ruleId,
          nodeType,
          message: 'lines ending in <pre> tags must not have substeps',
        }
      );
    });

    it('negative', async function () {
      await assertLintFree(`
        <emu-alg>
          1. If foo, bar.
          1. Else if foo, bar.
          1. Else, bar.
          1. If foo, then
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
          1. Other.
          1. Other:
            1. Substep.
          1. Let _constructorText_ be the source text
          <pre><code class="javascript">constructor() {}</code></pre>
          1. Set _constructor_ to ParseText(_constructorText_, |MethodDefinition[~Yield, ~Await]|).
        </emu-alg>
      `);
    });
  });

  describe('step numbering', function () {
    const ruleId = 'algorithm-step-numbering';

    it('simple', async function () {
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

    it('nested', async function () {
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
          2. Step:
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

    it('ten', async function () {
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

    it('negative', async function () {
      await assertLintFree(`
        <emu-alg>
          2. Step.
          3. Step.
          40. Step.
        </emu-alg>
      `);
    });
  });
});
