'use strict';

let { assertLint, positioned, lintLocationMarker: M, assertLintFree } = require('./utils.js');

describe('expression parsing', () => {
  describe('valid', () => {
    it('lists', async () => {
      await assertLintFree(`
        <emu-alg>
          1. Let _x_ be «».
          1. Set _x_ to « ».
          1. Set _x_ to «0».
          1. Set _x_ to «0, 1».
          1. Set _x_ to « 0,1 ».
        </emu-alg>
      `);
    });

    it('calls', async () => {
      await assertLintFree(`
        <emu-alg>
          1. Let _x_ be _foo_().
          1. Set _x_ to _foo_( ).
          1. Set _x_ to _foo_.[[Bar]]().
          1. Set _x_ to _foo_(0).
          1. Set _x_ to _foo_( 0 ).
          1. Set _x_ to _foo_(0, 1).
        </emu-alg>
      `);
    });

    it('records', async () => {
      await assertLintFree(`
        <emu-alg>
          1. Let _x_ be { [[x]]: 0 }.
          1. Set _x_ to {[[x]]:0}.
        </emu-alg>
      `);
    });

    it('record-spec', async () => {
      await assertLintFree(`
        <emu-alg>
          1. For each Record { [[Key]], [[Value]] } _p_ of _entries_, do
            1. Something.
        </emu-alg>
      `);
    });

    it('trailing comma in multi-line list', async () => {
      await assertLintFree(`
        <emu-alg>
        1. Let _x_ be «
            0,
            1,
          ».
        </emu-alg>
      `);
    });

    it('trailing comma in multi-line call', async () => {
      await assertLintFree(`
        <emu-alg>
        1. Let _x_ be _foo_(
            0,
            1,
          ).
        </emu-alg>
      `);
    });

    it('trailing comma in multi-line record', async () => {
      await assertLintFree(`
        <emu-alg>
        1. Let _x_ be the Record {
            [[X]]: 0,
            [[Y]]: 1,
          }.
        </emu-alg>
      `);
    });
  });

  describe('errors', () => {
    it('open paren without close', async () => {
      await assertLint(
        positioned`
          <emu-alg>
            1. Let (.${M}
          </emu-alg>
        `,
        {
          ruleId: 'expression-parsing',
          nodeType: 'emu-alg',
          message: 'unexpected eof (expected close parenthesis)',
        }
      );
    });

    it('close paren without open', async () => {
      await assertLint(
        positioned`
          <emu-alg>
            1. Let ${M}).
          </emu-alg>
        `,
        {
          ruleId: 'expression-parsing',
          nodeType: 'emu-alg',
          message: 'unexpected close parenthesis without corresponding open parenthesis',
        }
      );
    });

    it('mismatched open/close tokens', async () => {
      await assertLint(
        positioned`
          <emu-alg>
            1. Let _x_ be «_foo_(_a_${M}»).
          </emu-alg>
        `,
        {
          ruleId: 'expression-parsing',
          nodeType: 'emu-alg',
          message: 'unexpected list close without corresponding list open',
        }
      );
    });

    it('elision in list', async () => {
      await assertLint(
        positioned`
          <emu-alg>
            1. Let _x_ be «${M},».
          </emu-alg>
        `,
        {
          ruleId: 'expression-parsing',
          nodeType: 'emu-alg',
          message: 'unexpected comma (expected some content for element/argument)',
        }
      );

      await assertLint(
        positioned`
          <emu-alg>
            1. Let _x_ be «_x_, ${M}».
          </emu-alg>
        `,
        {
          ruleId: 'expression-parsing',
          nodeType: 'emu-alg',
          message: 'unexpected list close (expected some content for element)',
        }
      );
    });

    it('elision in call', async () => {
      await assertLint(
        positioned`
          <emu-alg>
            1. Let _x_ be _foo_(${M},)».
          </emu-alg>
        `,
        {
          ruleId: 'expression-parsing',
          nodeType: 'emu-alg',
          message: 'unexpected comma (expected some content for element/argument)',
        }
      );

      await assertLint(
        positioned`
          <emu-alg>
            1. Let _x_ be _foo_(_a_, ${M}).
          </emu-alg>
        `,
        {
          ruleId: 'expression-parsing',
          nodeType: 'emu-alg',
          message: 'unexpected close parenthesis (expected some content for argument)',
        }
      );
    });

    it('record without names', async () => {
      await assertLint(
        positioned`
          <emu-alg>
            1. Let _x_ be the Record { ${M}}.
          </emu-alg>
        `,
        {
          ruleId: 'expression-parsing',
          nodeType: 'emu-alg',
          message: 'expected to find record field',
        }
      );
    });

    it('record with malformed names', async () => {
      await assertLint(
        positioned`
          <emu-alg>
            1. Let _x_ be the Record { ${M}[x]: 0 }.
          </emu-alg>
        `,
        {
          ruleId: 'expression-parsing',
          nodeType: 'emu-alg',
          message: 'expected to find record field',
        }
      );
    });

    it('record with duplicate names', async () => {
      await assertLint(
        positioned`
          <emu-alg>
            1. Let _x_ be the Record { [[A]]: 0, [[${M}A]]: 0 }.
          </emu-alg>
        `,
        {
          ruleId: 'expression-parsing',
          nodeType: 'emu-alg',
          message: 'duplicate record field name A',
        }
      );
    });

    it('record where only some keys have values', async () => {
      await assertLint(
        positioned`
          <emu-alg>
            1. Let _x_ be the Record { [[A]], [[B]]${M}: 0 }.
          </emu-alg>
        `,
        {
          ruleId: 'expression-parsing',
          nodeType: 'emu-alg',
          message: 'record field has value but preceding field does not',
        }
      );

      await assertLint(
        positioned`
          <emu-alg>
            1. Let _x_ be the Record { [[A]]: 0, [[B]]${M} }.
          </emu-alg>
        `,
        {
          ruleId: 'expression-parsing',
          nodeType: 'emu-alg',
          message: 'expected record field to have value',
        }
      );
    });
  });
});
