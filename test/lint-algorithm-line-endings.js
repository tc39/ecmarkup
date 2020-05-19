'use strict';

let { assertLint, assertLintFree, lintLocationMarker: M, positioned } = require('./lint-helpers');

const ruleId = 'algorithm-line-endings';
const nodeType = 'EMU-ALG';

describe('linting algorithms', function () {
  describe('line endings', function () {
    it('simple', async function () {
      await assertLint(
        positioned`<emu-alg>
          1. ${M}testing
        </emu-alg>`,
        {
          ruleId,
          nodeType,
          message: 'expected freeform line to end with "." (found "testing")',
        }
      );
    });

    it('inline', async function () {
      await assertLint(positioned`<emu-alg>1. ${M}testing</emu-alg>`, {
        ruleId,
        nodeType,
        message: 'expected freeform line to end with "." (found "testing")',
      });
    });

    it('repeat', async function () {
      await assertLint(
        positioned`<emu-alg>
          1. ${M}Repeat, while _x_ < 10
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
          1. ${M}If _x_, then
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
          1. ${M}If _x_,
            1. Foo.
        </emu-alg>`,
        {
          ruleId,
          nodeType,
          message: 'expected "If" with substeps to end with ", then" (found ",")',
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
        </emu-alg>
      `);
    });
  });
});
