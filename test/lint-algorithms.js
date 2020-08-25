'use strict';

let { assertLint, assertLintFree, lintLocationMarker: M, positioned } = require('./utils.js');

const nodeType = 'emu-alg';

describe('linting algorithms', () => {
  describe('line endings', () => {
    const ruleId = 'algorithm-line-endings';

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
          1. If _x_, then${M}
        </emu-alg>`,
        {
          ruleId,
          nodeType,
          message: 'expected "If" without substeps to end with "." or ":" (found ", then")',
        }
      );
    });

    it('multiline if', async () => {
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

    it('pre', async () => {
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

    it('negative', async () => {
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
});
