'use strict';

let { assertLint, assertLintFree, positioned, lintLocationMarker: M } = require('./utils.js');

describe('typechecking', () => {
  describe('completion-returning AO not consumed as completion', () => {
    it('positive', async () => {
      await assertLint(
        positioned`
        <emu-clause id="example" type="abstract operation">
        <h1>
          ExampleAlg (): a normal completion containing a Number
        </h1>
        <dl class="header">
        </dl>
        <emu-alg>
          1. Return NormalCompletion(0).
        </emu-alg>
        </emu-clause>

        <emu-clause id="example2" type="abstract operation">
        <h1>
          Example2 ()
        </h1>
        <dl class="header">
        </dl>
        <emu-alg>
${M}      1. Return ExampleAlg().
        </emu-alg>
        </emu-clause>
        `,
        {
          ruleId: 'invocation-return-type',
          nodeType: 'emu-alg',
          message: 'ExampleAlg returns a Completion Record, but is not consumed as if it does',
        }
      );
    });

    // UUUUGH the check for Completion() assumes it's happening after auto-linking
    // so it only works if the Completion AO is defined
    it('negative', async () => {
      await assertLintFree(`
        <emu-clause id="example" type="abstract operation">
        <h1>
          ExampleAlg (): a normal completion containing a Number
        </h1>
        <dl class="header">
        </dl>
        <emu-alg>
          1. Return NormalCompletion(0).
        </emu-alg>
        </emu-clause>

        <emu-clause id="sec-completion-ao" type="abstract operation">
        <h1>
          Completion (
            _completionRecord_: a Completion Record,
          ): a Completion Record
        </h1>
        <dl class="header">
          <dt>description</dt>
          <dd>It is used to emphasize that a Completion Record is being returned.</dd>
        </dl>
        <emu-alg>
          1. Assert: _completionRecord_ is a Completion Record.
          1. Return _completionRecord_.
        </emu-alg>
        </emu-clause>

        <emu-clause id="example2" type="abstract operation">
        <h1>
          Example2 ()
        </h1>
        <dl class="header">
        </dl>
        <emu-alg>
          1. Let _a_ be Completion(ExampleAlg()).
          1. Set _a_ to ! ExampleAlg().
          1. Return ? ExampleAlg().
        </emu-alg>
        </emu-clause>

        <emu-clause id="example3" type="abstract operation" example>
        <h1>
          Example3 ()
        </h1>
        <dl class="header">
        </dl>
        <emu-alg example>
          1. Return ExampleAlg().
        </emu-alg>
        </emu-clause>
      `);
    });
  });

  describe('non-completion-returning AO consumed as completion', () => {
    it('positive', async () => {
      await assertLint(
        positioned`
        <emu-clause id="example" type="abstract operation">
        <h1>
          ExampleAlg (): a Number
        </h1>
        <dl class="header">
        </dl>
        <emu-alg>
          1. Return 0.
        </emu-alg>
        </emu-clause>

        <emu-clause id="example2" type="abstract operation">
        <h1>
          Example2 ()
        </h1>
        <dl class="header">
        </dl>
        <emu-alg>
${M}      1. Return ? ExampleAlg().
        </emu-alg>
        </emu-clause>
        `,
        {
          ruleId: 'invocation-return-type',
          nodeType: 'emu-alg',
          message: 'ExampleAlg does not return a Completion Record, but is consumed as if it does',
        }
      );
    });

    it('negative', async () => {
      await assertLintFree(`
        <emu-clause id="example" type="abstract operation">
        <h1>
          ExampleAlg (): a Number
        </h1>
        <dl class="header">
        </dl>
        <emu-alg>
          1. Return 0.
        </emu-alg>
        </emu-clause>

        <emu-clause id="example2" type="abstract operation">
        <h1>
          Example2 ()
        </h1>
        <dl class="header">
        </dl>
        <emu-alg>
          1. Return ExampleAlg().
        </emu-alg>
        </emu-clause>
      `);
    });
  });

  describe('throw, etc used in non-completion-returning AO', () => {
    it('positive', async () => {
      await assertLint(
        positioned`
        <emu-clause id="example" type="abstract operation">
        <h1>
          ExampleAlg (): a Number
        </h1>
        <dl class="header">
        </dl>
        <emu-alg>
          1. Return ${M}? Foo().
        </emu-alg>
        </emu-clause>
        `,
        {
          ruleId: 'completiony-thing-in-non-completion-algorithm',
          nodeType: 'emu-alg',
          message:
            'this would return a Completion Record, but the containing AO is declared not to return a Completion Record',
        }
      );

      await assertLint(
        positioned`
        <emu-clause id="example" type="abstract operation">
        <h1>
          ExampleAlg (): a Number
        </h1>
        <dl class="header">
        </dl>
        <emu-alg>
          1. ${M}Throw a new TypeError.
        </emu-alg>
        </emu-clause>
        `,
        {
          ruleId: 'completiony-thing-in-non-completion-algorithm',
          nodeType: 'emu-alg',
          message:
            'this would return a Completion Record, but the containing AO is declared not to return a Completion Record',
        }
      );

      await assertLint(
        positioned`
        <emu-clause id="example" type="abstract operation">
        <h1>
          ExampleAlg (): a Number
        </h1>
        <dl class="header">
        </dl>
        <emu-alg>
          1. ${M}Return Completion(_x_).
        </emu-alg>
        </emu-clause>
        `,
        {
          ruleId: 'completiony-thing-in-non-completion-algorithm',
          nodeType: 'emu-alg',
          message:
            'this would return a Completion Record, but the containing AO is declared not to return a Completion Record',
        }
      );
    });

    it('negative', async () => {
      await assertLintFree(`
        <emu-clause id="example" type="abstract operation">
        <h1>
          ExampleAlg (): either a normal completion containing a Number or an abrupt completion
        </h1>
        <dl class="header">
        </dl>
        <emu-alg>
          1. Return ? Foo().
          1. Return Completion(_x_).
          1. Throw a new TypeError.
        </emu-alg>
        </emu-clause>
      `);
    });
  });

  describe('completion-returning AO does not return a completion', () => {
    it('positive', async () => {
      await assertLint(
        positioned`
        <emu-clause id="example" type="abstract operation">
        <h1>
          ExampleAlg (): either a normal completion containing a Number or an abrupt completion
        </h1>
        <dl class="header">
        </dl>
        ${M}<emu-alg>
          1. Return Foo().
        </emu-alg>
        </emu-clause>
        `,
        {
          ruleId: 'completion-algorithm-lacks-completiony-thing',
          nodeType: 'emu-alg',
          message:
            'this algorithm is declared as returning a Completion Record, but there is no step which might plausibly return an abrupt completion',
        }
      );
    });

    it('negative', async () => {
      await assertLintFree(`
        <emu-clause id="example" type="abstract operation">
        <h1>
          ExampleAlg (): either a normal completion containing a Number or an abrupt completion
        </h1>
        <dl class="header">
        </dl>
        <emu-alg>
          1. Return ? Foo().
        </emu-alg>
        </emu-clause>
      `);

      await assertLintFree(`
        <emu-clause id="example" type="abstract operation">
        <h1>
          ExampleAlg (): a Number
        </h1>
        <dl class="header">
        </dl>
        <emu-alg>
          1. Return Foo().
        </emu-alg>
        </emu-clause>
      `);
    });
  });

  describe('AO returning unused is not Performed', () => {
    it('positive', async () => {
      await assertLint(
        positioned`
          <emu-clause id="example" type="abstract operation">
          <h1>
            ExampleAlg (): ~unused~
          </h1>
          <dl class="header">
          </dl>
          <emu-alg>
            1. Return Foo().
          </emu-alg>
          </emu-clause>

          <emu-clause id="example2" type="abstract operation">
          <h1>
            Example2 ()
          </h1>
          <dl class="header">
          </dl>
          <emu-alg>
${M}          1. Let _x_ be ExampleAlg().
          </emu-alg>
          </emu-clause>
        `,
        {
          ruleId: 'invocation-return-type',
          nodeType: 'emu-alg',
          message:
            'ExampleAlg does not return a meaningful value and should only be invoked as `Perform ExampleAlg(...).`',
        }
      );
    });

    it('negative', async () => {
      await assertLintFree(`
        <emu-clause id="example" type="abstract operation">
        <h1>
          ExampleAlg (): ~unused~
        </h1>
        <dl class="header">
        </dl>
        <emu-alg>
          1. Return Foo().
        </emu-alg>
        </emu-clause>

        <emu-clause id="example2" type="abstract operation">
        <h1>
          Example2 ()
        </h1>
        <dl class="header">
        </dl>
        <emu-alg>
          1. Perform ExampleAlg().
        </emu-alg>
        </emu-clause>
      `);
    });
  });

  describe('AO not returning unused is only Performed', () => {
    it('positive', async () => {
      await assertLint(
        positioned`
        ${M}<emu-clause id="example" type="abstract operation">
          <h1>
            ExampleAlg (): a Number
          </h1>
          <dl class="header">
          </dl>
          <emu-alg>
            1. Return 0.
          </emu-alg>
          </emu-clause>

          <emu-clause id="example2" type="abstract operation">
          <h1>
            Example2 ()
          </h1>
          <dl class="header">
          </dl>
          <emu-alg>
          1. Perform ExampleAlg().
          </emu-alg>
          </emu-clause>
        `,
        {
          ruleId: 'perform-not-unused',
          nodeType: 'emu-clause',
          message:
            'ExampleAlg is only ever invoked with Perform, so it should return ~unused~ or a Completion Record which, if normal, contains ~unused~',
        }
      );
    });

    it('negative', async () => {
      await assertLintFree(`
        <emu-clause id="example" type="abstract operation">
        <h1>
          ExampleAlg (): a Number
        </h1>
        <dl class="header">
        </dl>
        <emu-alg>
          1. Return 0.
        </emu-alg>
        </emu-clause>

        <emu-clause id="example2" type="abstract operation">
        <h1>
          Example2 ()
        </h1>
        <dl class="header">
        </dl>
        <emu-alg>
        1. Let _x_ be ExampleAlg().
        </emu-alg>
        </emu-clause>
      `);

      await assertLintFree(`
        <emu-clause id="example" type="abstract operation">
        <h1>
          ExampleAlg (): a throw completion
        </h1>
        <dl class="header">
        </dl>
        <emu-alg>
          1. Throw something.
        </emu-alg>
        </emu-clause>

        <emu-clause id="example2" type="abstract operation">
        <h1>
          Example2 ()
        </h1>
        <dl class="header">
        </dl>
        <emu-alg>
        1. Perform ? ExampleAlg().
        </emu-alg>
        </emu-clause>
      `);
    });
  });

  describe('AO is always invoked with !', () => {
    it('positive', async () => {
      await assertLint(
        positioned`
        ${M}<emu-clause id="example" type="abstract operation">
          <h1>
            ExampleAlg (): either a normal completion containing Number or an abrupt completion
          </h1>
          <dl class="header">
          </dl>
          <emu-alg>
            1. Return ? Foo().
          </emu-alg>
          </emu-clause>

          <emu-clause id="example2" type="abstract operation">
          <h1>
            Example2 ()
          </h1>
          <dl class="header">
          </dl>
          <emu-alg>
          1. Let _x_ be ! ExampleAlg().
          </emu-alg>
          </emu-clause>
        `,
        {
          ruleId: 'always-asserted-normal',
          nodeType: 'emu-clause',
          message:
            'every call site of ExampleAlg asserts the return value is a normal completion; it should be refactored to not return a completion record at all',
        }
      );
    });

    it('negative', async () => {
      await assertLintFree(`
        <emu-clause id="example" type="abstract operation">
          <h1>
            ExampleAlg (): either a normal completion containing Number or an abrupt completion
          </h1>
          <dl class="header">
          </dl>
          <emu-alg>
            1. Return ? Foo().
          </emu-alg>
          </emu-clause>

          <emu-clause id="example2" type="abstract operation">
          <h1>
            Example2 ()
          </h1>
          <dl class="header">
          </dl>
          <emu-alg>
          1. Let _x_ be ? ExampleAlg().
          </emu-alg>
          </emu-clause>
      `);
    });
  });

  describe('AO returns union of completion and non-completion', () => {
    it('positive', async () => {
      await assertLint(
        positioned`
          <emu-clause id="example" type="abstract operation">
          ${M}<h1>
            ExampleAlg (): either a normal completion containing a Number, or a boolean
          </h1>
          <dl class="header">
          </dl>
          <emu-alg>
            1. Return Foo().
          </emu-alg>
          </emu-clause>
        `,
        {
          ruleId: 'completion-union',
          nodeType: 'h1',
          message:
            'algorithms should return either completions or things which are not completions, never both',
        }
      );
    });

    it('negative', async () => {
      await assertLintFree(`
        <emu-clause id="example" type="abstract operation">
        <h1>
          ExampleAlg (): a normal completion containing either a Number or a boolean
        </h1>
        <dl class="header">
        </dl>
        <emu-alg>
          1. Return NormalCompletion(Foo()).
        </emu-alg>
        </emu-clause>
      `);
    });
  });
});
