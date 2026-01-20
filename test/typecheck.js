'use strict';

let {
  assertLint,
  assertLintFree,
  positioned,
  lintLocationMarker: M,
  getBiblio,
} = require('./utils.js');

describe('typechecking completions', () => {
  let biblio;
  before(async () => {
    biblio = await getBiblio(`
      <emu-clause id="sec-normalcompletion" type="abstract operation">
        <h1>
          NormalCompletion (
            _value_: any value except a Completion Record,
          ): a normal completion
        </h1>
        <dl class="header">
        </dl>
        <emu-alg>
          1. Return Completion Record { [[Type]]: ~normal~, [[Value]]: _value_, [[Target]]: ~empty~ }.
        </emu-alg>
      </emu-clause>

      <emu-clause id="sec-throwcompletion" type="abstract operation">
        <h1>
          ThrowCompletion (
            _value_: an ECMAScript language value,
          ): a throw completion
        </h1>
        <dl class="header">
        </dl>
        <emu-alg>
          1. Return Completion Record { [[Type]]: ~throw~, [[Value]]: _value_, [[Target]]: ~empty~ }.
        </emu-alg>
      </emu-clause>

      <emu-clause id="sec-returncompletion" type="abstract operation">
        <h1>
          ReturnCompletion (
            _value_: any value except a Completion Record,
          ): a return completion
        </h1>
        <dl class="header">
        </dl>
        <emu-alg>
          1. Return Completion Record { [[Type]]: ~return~, [[Value]]: _value_, [[Target]]: ~empty~ }.
        </emu-alg>
      </emu-clause>

      <emu-clause id="sec-completion-ao" type="abstract operation">
        <h1>
          Completion (
            _completionRecord_: a Completion Record,
          ): a Completion Record
        </h1>
        <dl class="header"></dl>
        <emu-alg>
          1. Assert: _completionRecord_ is a Completion Record.
          1. Return _completionRecord_.
        </emu-alg>
      </emu-clause>

      <emu-clause id="sec-examplecompletionao" type="abstract operation">
        <h1>
          ExampleCompletionAO (): a normal completion containing a number or an abrupt completion.
        </h1>
        <dl class="header">
        </dl>
        <emu-alg>
          1. If you want to, throw a new *Error* exception.
          1. Return Completion Record { [[Type]]: ~normal~, [[Value]]: 0, [[Target]]: ~empty~ }.
        </emu-alg>
      </emu-clause>

      <emu-clause id="sec-examplenoncompletionao" type="abstract operation">
        <h1>
          ExampleNonCompletionAO (
            _x_: unknown,
          ): a mathematical value
        </h1>
        <dl class="header">
        </dl>
        <emu-alg>
          1. Return 0.
        </emu-alg>
      </emu-clause>
    `);
  });

  describe('completion-returning AO not consumed as completion', () => {
    it('positive', async () => {
      await assertLint(
        positioned`
        <emu-clause id="example" type="abstract operation">
        <h1>
          ExampleAlg (): a normal completion containing a mathematical value
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
          1. Return ${M}ExampleAlg().
        </emu-alg>
        </emu-clause>
        `,
        {
          ruleId: 'typecheck',
          nodeType: 'emu-alg',
          message: 'ExampleAlg returns a Completion Record, but is not consumed as if it does',
        },
        {
          extraBiblios: [biblio],
        },
      );

      await assertLint(
        positioned`
          <emu-clause id="example" type="syntax-directed operation">
          <h1>
            ExampleAlg (): a normal completion containing a Number
          </h1>
          <dl class="header"></dl>
          </emu-clause>

          <emu-clause id="example2" type="abstract operation">
          <h1>
            Example2 ()
          </h1>
          <dl class="header">
          </dl>
          <emu-alg>
            1. Let _foo_ be 0.
            1. Return ${M}ExampleAlg of _foo_.
          </emu-alg>
          </emu-clause>
        `,
        {
          ruleId: 'typecheck',
          nodeType: 'emu-alg',
          message: 'ExampleAlg returns a Completion Record, but is not consumed as if it does',
        },
        {
          extraBiblios: [biblio],
        },
      );

      await assertLint(
        positioned`
        <emu-clause id="example" type="abstract operation">
        <h1>ExampleAlg ( )</h1>
        <dl class="header">
        </dl>
        <emu-alg>
          1. Do something with Completion(${M}NormalCompletion(0)).
        </emu-alg>
        </emu-clause>
        `,
        {
          ruleId: 'typecheck',
          nodeType: 'emu-alg',
          message:
            'NormalCompletion clearly creates a Completion Record; it does not need to be marked as such, and it would not be useful to immediately unwrap its result',
        },
        {
          extraBiblios: [biblio],
        },
      );
    });

    it('negative', async () => {
      await assertLintFree(
        `
          <emu-clause id="example" type="abstract operation">
          <h1>
            ExampleAlg (): a Completion Record
          </h1>
          <dl class="header">
          </dl>
          <emu-alg>
            1. If some condition holds, return ThrowCompletion(*null*).
            1. Else if some other condition holds, return ReturnCompletion(*null*).
            1. Return NormalCompletion(*null*).
          </emu-alg>
          </emu-clause>

          <emu-clause id="example-sdo" type="syntax-directed operation">
          <h1>
            ExampleSDO (
              optional _x_: a number,
            ): a normal completion containing a Number
          </h1>
          <dl class="header"></dl>
          </emu-clause>

          <emu-clause id="example2" type="abstract operation">
          <h1>
            Example2 ()
          </h1>
          <dl class="header">
          </dl>
          <emu-alg>
            1. Let _a_ be Completion(ExampleAlg()).
            1. Set _a_ to Completion(<emu-meta suppress-effects="user-code">ExampleAlg()</emu-meta>).
            1. Set _a_ to ! ExampleAlg().
            1. Return ? ExampleAlg().
            1. Return <ins>?</ins> ExampleAlg().
            1. Return <del>?</del> <ins>!</ins> ExampleAlg().
            1. Let _foo_ be 0.
            1. Set _a_ to Completion(ExampleSDO of _foo_).
            1. Set _a_ to Completion(ExampleSDO of _foo_ with argument 0).
            1. If ? ExampleSDO of _foo_ is *true*, then
              1. Something.
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
        `,
        {
          extraBiblios: [biblio],
        },
      );
    });
  });

  describe('non-completion-returning AO consumed as completion', () => {
    it('positive', async () => {
      await assertLint(
        positioned`
        <emu-clause id="example" type="abstract operation">
        <h1>
          ExampleAlg (): a mathematical value
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
          1. Return ? ${M}ExampleAlg().
        </emu-alg>
        </emu-clause>
        `,
        {
          ruleId: 'typecheck',
          nodeType: 'emu-alg',
          message: 'ExampleAlg does not return a Completion Record, but is consumed as if it does',
        },
      );
    });

    it('negative', async () => {
      await assertLintFree(`
        <emu-clause id="example" type="abstract operation">
        <h1>
          ExampleAlg (): a mathematical value
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
          1. Return <del>!</del> ExampleAlg().
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
          1. Let _foo_ be 0.
          1. Return ${M}? _foo_.
        </emu-alg>
        </emu-clause>
        `,
        {
          ruleId: 'typecheck',
          nodeType: 'emu-alg',
          message:
            'this would return an abrupt completion, but the containing AO is declared not to return an abrupt completion',
        },
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
          1. ${M}Throw a *TypeError* exception.
        </emu-alg>
        </emu-clause>
        `,
        {
          ruleId: 'typecheck',
          nodeType: 'emu-alg',
          message:
            'this would return an abrupt completion, but the containing AO is declared not to return an abrupt completion',
        },
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
          1. If some condition is met, ${M}throw a *TypeError* exception.
        </emu-alg>
        </emu-clause>
        `,
        {
          ruleId: 'typecheck',
          nodeType: 'emu-alg',
          message:
            'this would return an abrupt completion, but the containing AO is declared not to return an abrupt completion',
        },
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
          1. Let _foo_ be a thing.
          1. ${M}Throw _foo_.
        </emu-alg>
        </emu-clause>
        `,
        {
          ruleId: 'typecheck',
          nodeType: 'emu-alg',
          message:
            'this would return an abrupt completion, but the containing AO is declared not to return an abrupt completion',
        },
      );

      await assertLint(
        positioned`
        <emu-clause id="example" type="abstract operation">
        <h1>
          ExampleAlg (): a normal completion containing a Number
        </h1>
        <dl class="header">
        </dl>
        <emu-alg>
          1. Let _foo_ be a thing.
          1. ${M}Throw _foo_.
        </emu-alg>
        </emu-clause>
        `,
        {
          ruleId: 'typecheck',
          nodeType: 'emu-alg',
          message:
            'this would return an abrupt completion, but the containing AO is declared not to return an abrupt completion',
        },
      );

      await assertLint(
        positioned`
        <emu-clause id="example" type="abstract operation">
        <h1>
          ExampleAlg (): a mathematical value
        </h1>
        <dl class="header">
        </dl>
        <emu-alg>
          1. Let _x_ be 0.
          1. Return ${M}Completion(_x_).
        </emu-alg>
        </emu-clause>
        `,
        {
          ruleId: 'typecheck',
          nodeType: 'emu-alg',
          message:
            "type of returned value (a normal completion or an abrupt completion) does not look plausibly assignable to algorithm's return type (mathematical value)",
        },
        {
          extraBiblios: [biblio],
        },
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
          1. Let _x_ be 0.
          1. ${M}Return Completion Record { [[Type]]: ~return~, [[Value]]: _x_, [[Target]]: ~empty~ }.
        </emu-alg>
        </emu-clause>
        `,
        {
          ruleId: 'typecheck',
          nodeType: 'emu-alg',
          message:
            'this would return an abrupt completion, but the containing AO is declared not to return an abrupt completion',
        },
      );
    });

    it('negative', async () => {
      await assertLintFree(
        `
          <emu-clause id="example" type="abstract operation">
          <h1>
            ExampleAlg (): either a normal completion containing a Number or an abrupt completion
          </h1>
          <dl class="header">
          </dl>
          <emu-alg>
            1. Let _foo_ be 0.
            1. Let _x_ be 0.
            1. Return ? _foo_.
            1. Return Completion(_x_).
            1. Throw a new TypeError.
          </emu-alg>
          </emu-clause>
        `,
        {
          extraBiblios: [biblio],
        },
      );

      await assertLintFree(
        `
          <emu-clause id="example" type="abstract operation">
          <h1>
            ExampleAlg (): a Number
          </h1>
          <dl class="header">
          </dl>
          <emu-alg>
            1. Do something with Completion(ExampleCompletionAO()).
            1. NOTE: This will not throw a *TypeError* exception.
            1. Consider whether something is a return completion.
            1. <del>Throw a *RangeError* exception.</del>
          </emu-alg>
          </emu-clause>
        `,
        {
          extraBiblios: [biblio],
        },
      );

      await assertLintFree(
        `
          <emu-clause id="example" type="abstract operation">
          <h1>
            ExampleAlg (): a mathematical value
          </h1>
          <dl class="header">
          </dl>
          <emu-alg>
            1. Let _addend_ be 41.
            1. Let _closure_ be a new Abstract Closure with parameters (_x_) that captures _addend_ and performs the following steps when called:
              1. Return _x_ + ? ExampleCompletionAO(_addend_).
            1. Let _val_ be ! _closure_(1).
            1. Return _val_.
          </emu-alg>
          </emu-clause>
        `,
        {
          extraBiblios: [biblio],
        },
      );
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
          1. Let _foo_ be 0.
          1. Return _foo_.
        </emu-alg>
        </emu-clause>
        `,
        {
          ruleId: 'completion-algorithm-lacks-completiony-thing',
          nodeType: 'emu-alg',
          message:
            'this algorithm is declared as returning an abrupt completion, but there is no step which might plausibly return an abrupt completion',
        },
      );
    });

    it('negative', async () => {
      async function assertStepIsConsideredAbrupt(step) {
        await assertLintFree(
          `
            <emu-clause id="example" type="abstract operation">
            <h1>
              ExampleAlg (): either a normal completion containing a mathematical value or an abrupt completion
            </h1>
            <dl class="header">
            </dl>
            <emu-alg>
              1. Let _foo_ be 0.
              1. ${step}
            </emu-alg>
            </emu-clause>
          `,
          {
            extraBiblios: [biblio],
          },
        );
      }

      await assertStepIsConsideredAbrupt('Return ? _foo_.');
      await assertStepIsConsideredAbrupt('Return <ins>?</ins> _foo_.');

      await assertStepIsConsideredAbrupt('Return ExampleNonCompletionAO(? _foo_).');

      await assertLintFree(`
        <emu-clause id="example" type="abstract operation">
        <h1>
          ExampleAlg (): a Number
        </h1>
        <dl class="header">
        </dl>
        <emu-alg>
          1. Let _foo_ be 0.
          1. Return _foo_.
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
            1. Let _foo_ be 0.
            1. Return _foo_.
          </emu-alg>
          </emu-clause>

          <emu-clause id="example2" type="abstract operation">
          <h1>
            Example2 ()
          </h1>
          <dl class="header">
          </dl>
          <emu-alg>
            1. Let _x_ be ${M}ExampleAlg().
            1. Return _x_.
          </emu-alg>
          </emu-clause>
        `,
        {
          ruleId: 'typecheck',
          nodeType: 'emu-alg',
          message:
            'ExampleAlg does not return a meaningful value and should only be invoked as `Perform ExampleAlg(...).`',
        },
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
          1. Let _foo_ be 0.
          1. Return _foo_.
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
            ExampleAlg (): a mathematical value
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
        },
      );
    });

    it('negative', async () => {
      await assertLintFree(`
        <emu-clause id="example" type="abstract operation">
        <h1>
          ExampleAlg (): a mathematical value
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
          1. Return _x_.
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
          1. Throw a *TypeError* exception.
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

      await assertLintFree(`
        <emu-clause id="example" type="abstract operation">
        <h1>
          ExampleAlg (): a mathematical value
        </h1>
        <dl class="header">
          <dt>skip global checks</dt>
          <dd>true</dd>
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
            1. Let _foo_ be 0.
            1. Return ? _foo_.
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
            1. Return _x_.
          </emu-alg>
          </emu-clause>
        `,
        {
          ruleId: 'always-asserted-normal',
          nodeType: 'emu-clause',
          message:
            'every call site of ExampleAlg asserts the return value is a normal completion; it should be refactored to not return a completion record at all. if this AO is called in ways ecmarkup cannot analyze, add the "skip global checks" attribute to the header.',
        },
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
            1. Let _foo_ be 0.
            1. Return ? _foo_.
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
            1. Return _x_.
          </emu-alg>
          </emu-clause>
      `);

      await assertLintFree(`
        <emu-clause id="example" type="abstract operation">
          <h1>
            ExampleAlg (): either a normal completion containing Number or an abrupt completion
          </h1>
          <dl class="header">
            <dt>skip global checks</dt>
            <dd>true</dd>
          </dl>
          <emu-alg>
            1. Let _foo_ be 0.
            1. Return ? _foo_.
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
            1. Return _x_.
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
            1. Return 0.
          </emu-alg>
          </emu-clause>
        `,
        {
          ruleId: 'completion-union',
          nodeType: 'h1',
          message:
            'algorithms should return either completions or things which are not completions, never both',
        },
      );
    });

    it('negative', async () => {
      await assertLintFree(
        `
          <emu-clause id="example" type="abstract operation">
          <h1>
            ExampleAlg (): a normal completion containing either a Number or a boolean
          </h1>
          <dl class="header">
          </dl>
          <emu-alg>
            1. Return NormalCompletion(0).
          </emu-alg>
          </emu-clause>
        `,
        {
          extraBiblios: [biblio],
        },
      );
    });
  });
});

describe('signature agreement', async () => {
  let biblio;
  before(async () => {
    biblio = await getBiblio(`
      <emu-clause id="example" type="abstract operation">
        <h1>TakesNoArgs ()</h1>
        <dl class="header"></dl>
      </emu-clause>

      <emu-clause id="example" type="abstract operation">
        <h1>TakesOneArg ( _x_ )</h1>
        <dl class="header"></dl>
      </emu-clause>

      <emu-clause id="example" type="abstract operation">
        <h1>TakesOneOrTwoArgs ( _x_, [_y_] )</h1>
        <dl class="header"></dl>
      </emu-clause>

      <emu-clause id="example-sdo-1" type="syntax-directed operation">
        <h1>SDOTakesNoArgs ()</h1>
        <dl class="header"></dl>
      </emu-clause>

      <emu-clause id="example-sdo-2" type="syntax-directed operation">
        <h1>SDOTakesOneArg ( _x_ )</h1>
        <dl class="header"></dl>
      </emu-clause>

      <emu-clause id="example-sdo-3" type="syntax-directed operation">
        <h1>SDOTakesOneOrTwoArgs ( _x_, [_y_] )</h1>
        <dl class="header"></dl>
      </emu-clause>

      <emu-clause id="abstract-methods">
        <h1>Abstract Methods</h1>
        <emu-table type="abstract methods" of="Something">
          <table>
            <tr>
              <td>
                SomeMethod (
                  _x_: a String
                ) : a String
              </td>
              <td></td>
            </tr>
          </table>
        </emu-table>
      </emu-clause>
    `);
  });

  it('extra args', async () => {
    await assertLint(
      positioned`
        <emu-alg>
          1. Return ${M}TakesNoArgs(0).
        </emu-alg>
      `,
      {
        ruleId: 'typecheck',
        nodeType: 'emu-alg',
        message: 'TakesNoArgs takes 0 arguments, but this invocation passes 1',
      },
      {
        extraBiblios: [biblio],
      },
    );

    await assertLint(
      positioned`
        <emu-alg>
          1. Return <emu-meta suppress-effects="user-code">${M}TakesNoArgs(0)</emu-meta>.
        </emu-alg>
      `,
      {
        ruleId: 'typecheck',
        nodeType: 'emu-alg',
        message: 'TakesNoArgs takes 0 arguments, but this invocation passes 1',
      },
      {
        extraBiblios: [biblio],
      },
    );

    await assertLint(
      positioned`
        <emu-alg>
          1. Return ${M}TakesOneOrTwoArgs(0, 1, 2).
        </emu-alg>
      `,
      {
        ruleId: 'typecheck',
        nodeType: 'emu-alg',
        message: 'TakesOneOrTwoArgs takes 1-2 arguments, but this invocation passes 3',
      },
      {
        extraBiblios: [biblio],
      },
    );
  });

  it('extra args for sdo', async () => {
    await assertLint(
      positioned`
        <emu-alg>
          1. Let _foo_ be 0.
          1. Return ${M}SDOTakesNoArgs of _foo_ with argument 1.
        </emu-alg>
      `,
      {
        ruleId: 'typecheck',
        nodeType: 'emu-alg',
        message: 'SDOTakesNoArgs takes 0 arguments, but this invocation passes 1',
      },
      {
        extraBiblios: [biblio],
      },
    );

    await assertLint(
      positioned`
        <emu-alg>
          1. Let _foo_ be 0.
          1. Return <emu-meta suppress-effects="user-code">${M}SDOTakesNoArgs of _foo_ with argument 0</emu-meta>.
        </emu-alg>
      `,
      {
        ruleId: 'typecheck',
        nodeType: 'emu-alg',
        message: 'SDOTakesNoArgs takes 0 arguments, but this invocation passes 1',
      },
      {
        extraBiblios: [biblio],
      },
    );

    await assertLint(
      positioned`
        <emu-alg>
          1. Let _foo_ be 0.
          1. Return ${M}SDOTakesOneOrTwoArgs of _foo_ with arguments 0, 1, and 2.
        </emu-alg>
      `,
      {
        ruleId: 'typecheck',
        nodeType: 'emu-alg',
        message: 'SDOTakesOneOrTwoArgs takes 1-2 arguments, but this invocation passes 3',
      },
      {
        extraBiblios: [biblio],
      },
    );
  });

  it('extra args for abstract method', async () => {
    await assertLint(
      positioned`
        <emu-alg>
          1. Let _obj_ be a Something.
          1. Return ${M}_obj_.SomeMethod(*"a"*, *"b"*).
        </emu-alg>
      `,
      {
        ruleId: 'typecheck',
        nodeType: 'emu-alg',
        message: 'SomeMethod takes 1 argument, but this invocation passes 2',
      },
      {
        extraBiblios: [biblio],
      },
    );
  });

  it('too few args', async () => {
    await assertLint(
      positioned`
        <emu-alg>
          1. Return ${M}TakesOneArg().
        </emu-alg>
      `,
      {
        ruleId: 'typecheck',
        nodeType: 'emu-alg',
        message: 'TakesOneArg takes 1 argument, but this invocation passes 0',
      },
      {
        extraBiblios: [biblio],
      },
    );

    await assertLint(
      positioned`
        <emu-alg>
          1. Return ${M}TakesOneOrTwoArgs().
        </emu-alg>
      `,
      {
        ruleId: 'typecheck',
        nodeType: 'emu-alg',
        message: 'TakesOneOrTwoArgs takes 1-2 arguments, but this invocation passes 0',
      },
      {
        extraBiblios: [biblio],
      },
    );
  });

  it('too few args for sdo', async () => {
    await assertLint(
      positioned`
        <emu-alg>
          1. Let _foo_ be 0.
          1. Return ${M}SDOTakesOneArg of _foo_.
        </emu-alg>
      `,
      {
        ruleId: 'typecheck',
        nodeType: 'emu-alg',
        message: 'SDOTakesOneArg takes 1 argument, but this invocation passes 0',
      },
      {
        extraBiblios: [biblio],
      },
    );

    await assertLint(
      positioned`
        <emu-alg>
          1. Let _foo_ be 0.
          1. Return ${M}SDOTakesOneOrTwoArgs of _foo_.
        </emu-alg>
      `,
      {
        ruleId: 'typecheck',
        nodeType: 'emu-alg',
        message: 'SDOTakesOneOrTwoArgs takes 1-2 arguments, but this invocation passes 0',
      },
      {
        extraBiblios: [biblio],
      },
    );
  });

  it('too few args for abstract method', async () => {
    await assertLint(
      positioned`
        <emu-alg>
          1. Let _obj_ be a Something.
          1. Return ${M}_obj_.SomeMethod().
        </emu-alg>
      `,
      {
        ruleId: 'typecheck',
        nodeType: 'emu-alg',
        message: 'SomeMethod takes 1 argument, but this invocation passes 0',
      },
      {
        extraBiblios: [biblio],
      },
    );
  });

  it('argument of the wrong type for abstract method', async () => {
    await assertLint(
      positioned`
        <emu-alg>
          1. Let _obj_ be a Something.
          1. Return _obj_.SomeMethod(${M}~foo~).
        </emu-alg>
      `,
      {
        ruleId: 'typecheck',
        nodeType: 'emu-alg',
        message: 'argument (~foo~) does not look plausibly assignable to parameter type (String)',
      },
      {
        extraBiblios: [biblio],
      },
    );
  });

  it("<del>'d params don't contribute to signature", async () => {
    let biblio = await getBiblio(`
      <emu-clause id="del-complex" type="abstract operation">
        <h1>
        DelExample (
            <del>_x_: unknown,</del>
            _y_: unknown,
            <ins>_z_: unknown,</ins>
            <ins>_w_: unknown,</ins>
          ): unknown
        </h1>
        <dl class="header"></dl>
      </emu-clause>
    `);

    await assertLint(
      positioned`
        <emu-alg>
          1. Return ${M}DelExample(*"x"*, *"y"*).
        </emu-alg>
      `,
      {
        ruleId: 'typecheck',
        nodeType: 'emu-alg',
        message: 'DelExample takes 3 arguments, but this invocation passes 2',
      },
      {
        extraBiblios: [biblio],
      },
    );

    await assertLintFree(
      `
        <emu-alg>
          1. Return DelExample(*"y"*, *"z"*, *"w"*).
        </emu-alg>
      `,
      {
        extraBiblios: [biblio],
      },
    );
  });

  it('negative', async () => {
    await assertLintFree(
      `
        <emu-alg>
          1. Let _foo_ be 0.
          1. Perform TakesNoArgs().
          1. Perform TakesOneArg(0).
          1. Perform TakesOneOrTwoArgs(0).
          1. Perform TakesOneOrTwoArgs(0, 1).
          1. Perform <emu-meta suppress-effects="user-code">TakesNoArgs()</emu-meta>.
          1. Perform SDOTakesNoArgs of _foo_.
          1. Perform SDOTakesOneArg of _foo_ with argument 0.
          1. Perform SDOTakesOneOrTwoArgs of _foo_ with argument 0.
          1. Perform SDOTakesOneOrTwoArgs of _foo_ with arguments 0 and 1.
          1. Perform <emu-meta suppress-effects="user-code">SDOTakesNoArgs of _foo_</emu-meta>.
        </emu-alg>
      `,
      {
        extraBiblios: [biblio],
      },
    );
  });
});

describe('invocation kind', async () => {
  let biblio;
  before(async () => {
    biblio = await getBiblio(`
      <emu-clause id="example" type="abstract operation">
        <h1>AO ()</h1>
        <dl class="header"></dl>
      </emu-clause>

      <emu-clause id="example-sdo" type="syntax-directed operation">
        <h1>SDO ()</h1>
        <dl class="header"></dl>
      </emu-clause>

      <emu-clause id="abstract-methods">
        <h1>Abstract Methods</h1>
        <emu-table type="abstract methods" of="Something">
          <table>
            <tr>
              <td>
                SomeMethod ( ) : a string
              </td>
              <td></td>
            </tr>
          </table>
        </emu-table>
      </emu-clause>
    `);
  });

  it('SDO invoked as AO', async () => {
    await assertLint(
      positioned`
        <emu-alg>
          1. Return ${M}SDO().
        </emu-alg>
      `,
      {
        ruleId: 'typecheck',
        nodeType: 'emu-alg',
        message: 'SDO is a syntax-directed operation and should not be invoked like a regular call',
      },
      {
        extraBiblios: [biblio],
      },
    );
  });

  it('AO invoked as SDO', async () => {
    await assertLint(
      positioned`
        <emu-alg>
          1. Let _foo_ be 0.
          1. Return ${M}AO of _foo_.
        </emu-alg>
      `,
      {
        ruleId: 'typecheck',
        nodeType: 'emu-alg',
        message: 'AO is not a syntax-directed operation but here is being invoked as one',
      },
      {
        extraBiblios: [biblio],
      },
    );
  });

  it('abstract method invoked as SDO', async () => {
    await assertLint(
      positioned`
        <emu-alg>
          1. Let _obj_ be a Something.
          1. Return ${M}SomeMethod of _obj_.
        </emu-alg>
      `,
      {
        ruleId: 'typecheck',
        nodeType: 'emu-alg',
        message: 'SomeMethod is not a syntax-directed operation but here is being invoked as one',
      },
      {
        extraBiblios: [biblio],
      },
    );
  });

  it('abstract method invoked as AO', async () => {
    await assertLint(
      positioned`
        <emu-alg>
          1. Return ${M}SomeMethod().
        </emu-alg>
      `,
      {
        ruleId: 'typecheck',
        nodeType: 'emu-alg',
        message: 'SomeMethod is a method but here it is missing a record to call it on',
      },
      {
        extraBiblios: [biblio],
      },
    );
  });

  it('AO invoked as abstract method', async () => {
    await assertLint(
      positioned`
        <emu-alg>
          1. Let _foo_ be Something.
          1. Return ${M}_foo_.AO().
        </emu-alg>
      `,
      {
        ruleId: 'typecheck',
        nodeType: 'emu-alg',
        message: 'AO is not a method but here it is being called as one',
      },
      {
        extraBiblios: [biblio],
      },
    );
  });

  it('SDO invoked as abstract method', async () => {
    await assertLint(
      positioned`
        <emu-alg>
          1. Let _foo_ be Something.
          1. Return ${M}_foo_.SDO().
        </emu-alg>
      `,
      {
        ruleId: 'typecheck',
        nodeType: 'emu-alg',
        message: 'SDO is a syntax-directed operation and should not be invoked like a regular call',
      },
      {
        extraBiblios: [biblio],
      },
    );
  });

  it('negative', async () => {
    await assertLintFree(
      `
        <emu-clause id="example" type="abstract operation">
        <h1>
          Example ()
        </h1>
        <dl class="header">
        </dl>
        <emu-alg example>
          1. Perform AO().
          1. Perform SDO of _foo_.
        </emu-alg>
        </emu-clause>
      `,
      {
        extraBiblios: [biblio],
      },
    );
  });
});

describe('negation', async () => {
  let biblio;
  before(async () => {
    biblio = await getBiblio(`
      <emu-clause id="example" type="abstract operation">
        <h1>F ()</h1>
        <dl class="header"></dl>
      </emu-clause>
    `);
  });

  it('AO with a dash in it', async () => {
    await assertLint(
      positioned`
        <emu-alg>
          1. Return ${M}x-F().
        </emu-alg>
      `,
      {
        ruleId: 'typecheck',
        nodeType: 'emu-alg',
        message: 'could not find definition for x-F',
      },
      {
        extraBiblios: [biblio],
      },
    );
  });

  it('AO with a dash in it, negated', async () => {
    await assertLint(
      positioned`
        <emu-alg>
          1. Return -${M}x-F().
        </emu-alg>
      `,
      {
        ruleId: 'typecheck',
        nodeType: 'emu-alg',
        message: 'could not find definition for x-F',
      },
      {
        extraBiblios: [biblio],
      },
    );
  });

  it('negative: binary minus', async () => {
    await assertLintFree(
      `
        <emu-alg>
          1. Return x - F().
        </emu-alg>
      `,
      {
        extraBiblios: [biblio],
      },
    );
  });

  it('negative: unary negation', async () => {
    await assertLintFree(
      `
        <emu-alg>
          1. Return -F().
        </emu-alg>
      `,
      {
        extraBiblios: [biblio],
      },
    );
  });
});

describe('type system', () => {
  async function assertTypeError(
    paramType,
    arg,
    messageForParam,
    messageForReturn,
    extraBiblios = [],
  ) {
    await assertLint(
      positioned`
        <emu-clause id="example" type="abstract operation">
          <h1>
            Example (
              arg: ${paramType}
            ): ~unused~
          </h1>
          <dl class="header"></dl>
        </emu-clause>
        <emu-alg>
          1. Perform Example(${M}${arg}).
        </emu-alg>
      `,
      {
        ruleId: 'typecheck',
        nodeType: 'emu-alg',
        message: messageForParam,
      },
      {
        extraBiblios,
      },
    );

    if (messageForReturn === null) {
      await assertLintFree(
        `
          <emu-clause id="example" type="abstract operation">
            <h1>Example (): ${paramType}</h1>
            <dl class="header"></dl>
            <emu-alg>
              1. ${paramType.includes('abrupt completion') ? 'Throw a new *Error*.' : 'Do something.'}
              1. Return ${arg}.
            </emu-alg>
          </emu-clause>
        `,
        {
          extraBiblios,
        },
      );
    } else {
      await assertLint(
        positioned`
          <emu-clause id="example" type="abstract operation">
            <h1>Example (): ${paramType}</h1>
            <dl class="header"></dl>
            <emu-alg>
              1. ${paramType.includes('abrupt completion') ? 'Throw a new *Error*.' : 'Do something.'}
              1. Return ${M}${arg}.
            </emu-alg>
          </emu-clause>
        `,
        {
          ruleId: 'typecheck',
          nodeType: 'emu-alg',
          message: messageForReturn,
        },
        {
          extraBiblios,
        },
      );
    }
  }

  async function assertNoTypeError(paramType, arg, extraBiblios = []) {
    await assertLintFree(
      `
        <emu-clause id="example" type="abstract operation">
          <h1>
            Example (
              arg: ${paramType}
            ): ~unused~
          </h1>
          <dl class="header"></dl>
        </emu-clause>
        <emu-alg>
          1. Perform Example(${arg}).
        </emu-alg>
      `,
      { extraBiblios },
    );
  }

  let completionBiblio;
  before(async () => {
    completionBiblio = await getBiblio(`
      <emu-clause id="normal-completion" type="abstract operation">
        <h1>
          NormalCompletion ( _x_ ): a normal completion
        </h1>
        <dl class="header"></dl>
      </emu-clause>

      <emu-clause id="sec-completion-ao" type="abstract operation">
        <h1>
          Completion (
            _completionRecord_: a Completion Record,
          ): a Completion Record
        </h1>
        <dl class="header"></dl>
        <emu-alg>
          1. Assert: _completionRecord_ is a Completion Record.
          1. Return _completionRecord_.
        </emu-alg>
      </emu-clause>

      <emu-clause id="throwy" type="abstract operation">
        <h1>
          Throwy (): either a normal completion containing a Boolean or an abrupt completion
        </h1>
        <dl class="header"></dl>
      </emu-clause>

      `);
  });

  it('enum', async () => {
    await assertTypeError(
      '~sync~ or ~async~',
      '~iterate-strings~',
      'argument (~iterate-strings~) does not look plausibly assignable to parameter type (~sync~ or ~async~)',
      "returned value (~iterate-strings~) does not look plausibly assignable to algorithm's return type (~sync~ or ~async~)",
    );

    await assertNoTypeError('~sync~ or ~async~', '~sync~');
    await assertNoTypeError('~sync~ or ~async~', '~async~');
  });

  it('boolean', async () => {
    await assertTypeError(
      'a Number',
      '*false*',
      'argument (false) does not look plausibly assignable to parameter type (Number)',
      "returned value (false) does not look plausibly assignable to algorithm's return type (Number)",
    );

    await assertTypeError(
      'a Boolean',
      '*1*<sub>𝔽</sub>',
      'argument (*1*<sub>𝔽</sub>) does not look plausibly assignable to parameter type (Boolean)',
      "returned value (*1*<sub>𝔽</sub>) does not look plausibly assignable to algorithm's return type (Boolean)",
    );

    await assertNoTypeError('a Boolean', '*false*');
  });

  it('null/undefined', async () => {
    await assertTypeError(
      '*null*',
      '*undefined*',
      'argument (undefined) does not look plausibly assignable to parameter type (null)',
      "returned value (undefined) does not look plausibly assignable to algorithm's return type (null)",
    );
    await assertTypeError(
      'a Boolean or *null*',
      '*undefined*',
      'argument (undefined) does not look plausibly assignable to parameter type (Boolean or null)',
      "returned value (undefined) does not look plausibly assignable to algorithm's return type (Boolean or null)",
    );
    await assertTypeError(
      '*undefined*',
      '*null*',
      'argument (null) does not look plausibly assignable to parameter type (undefined)',
      "returned value (null) does not look plausibly assignable to algorithm's return type (undefined)",
    );
    await assertTypeError(
      'a Boolean or *undefined*',
      '*null*',
      'argument (null) does not look plausibly assignable to parameter type (Boolean or undefined)',
      "returned value (null) does not look plausibly assignable to algorithm's return type (Boolean or undefined)",
    );

    await assertNoTypeError('an ECMAScript language value', '*null*');
    await assertNoTypeError('an ECMAScript language value', '*undefined*');
    await assertNoTypeError('*null* or *undefined*', '*null*');
    await assertNoTypeError('*null* or *undefined*', '*undefined*');
    await assertNoTypeError('a Boolean or *null*', '*null*');
    await assertNoTypeError('a Boolean or *undefined*', '*undefined*');
  });

  it('bigint', async () => {
    await assertTypeError(
      'a BigInt',
      '5',
      'argument (5) does not look plausibly assignable to parameter type (BigInt)\n' +
        'hint: you passed a mathematical value, but this position takes an ES language BigInt',
      "returned value (5) does not look plausibly assignable to algorithm's return type (BigInt)\n" +
        'hint: you returned a mathematical value, but this algorithm returns an ES language BigInt',
    );

    await assertTypeError(
      'an integer',
      '*5*<sub>ℤ</sub>',
      'argument (*5*<sub>ℤ</sub>) does not look plausibly assignable to parameter type (integer)\n' +
        'hint: you passed an ES language BigInt, but this position takes a mathematical value',
      "returned value (*5*<sub>ℤ</sub>) does not look plausibly assignable to algorithm's return type (integer)\n" +
        'hint: you returned an ES language BigInt, but this algorithm returns a mathematical value',
    );

    await assertNoTypeError('a BigInt', '*5*<sub>ℤ</sub>');
  });

  it('number', async () => {
    await assertTypeError(
      'an integer',
      '0.5',
      'argument (0.5) does not look plausibly assignable to parameter type (integer)',
      "returned value (0.5) does not look plausibly assignable to algorithm's return type (integer)",
    );

    await assertNoTypeError('an integer', '2');

    await assertTypeError(
      'a non-negative integer',
      '-1',
      'argument (-1) does not look plausibly assignable to parameter type (non-negative integer)',
      "returned value (-1) does not look plausibly assignable to algorithm's return type (non-negative integer)",
    );

    await assertNoTypeError('a non-negative integer', '3');

    await assertTypeError(
      '*1*<sub>𝔽</sub>',
      '*2*<sub>𝔽</sub>',
      'argument (*2*<sub>𝔽</sub>) does not look plausibly assignable to parameter type (*1*<sub>𝔽</sub>)',
      "returned value (*2*<sub>𝔽</sub>) does not look plausibly assignable to algorithm's return type (*1*<sub>𝔽</sub>)",
    );

    await assertTypeError(
      '*+0*<sub>𝔽</sub>',
      '*-0*<sub>𝔽</sub>',
      'argument (*-0*<sub>𝔽</sub>) does not look plausibly assignable to parameter type (*+0*<sub>𝔽</sub>)',
      "returned value (*-0*<sub>𝔽</sub>) does not look plausibly assignable to algorithm's return type (*+0*<sub>𝔽</sub>)",
    );

    await assertTypeError(
      'an integral Number',
      '*0.5*<sub>𝔽</sub>',
      'argument (*0.5*<sub>𝔽</sub>) does not look plausibly assignable to parameter type (integral Number)',
      "returned value (*0.5*<sub>𝔽</sub>) does not look plausibly assignable to algorithm's return type (integral Number)",
    );

    await assertTypeError(
      'an integral Number',
      '*NaN*',
      'argument (*NaN*) does not look plausibly assignable to parameter type (integral Number)',
      "returned value (*NaN*) does not look plausibly assignable to algorithm's return type (integral Number)",
    );

    await assertTypeError(
      'an integral Number',
      '*+&infin;*<sub>𝔽</sub>',
      'argument (*+&infin;*<sub>𝔽</sub>) does not look plausibly assignable to parameter type (integral Number)',
      "returned value (*+&infin;*<sub>𝔽</sub>) does not look plausibly assignable to algorithm's return type (integral Number)",
    );

    await assertNoTypeError('*2*<sub>𝔽</sub>', '*2*<sub>𝔽</sub>');
    await assertNoTypeError('a Number', '*2*<sub>𝔽</sub>');
    await assertNoTypeError('a Number', '*+&infin;*<sub>𝔽</sub>');
    await assertNoTypeError('a Number', '*-&infin;*<sub>𝔽</sub>');
    await assertNoTypeError('a Number', '*NaN*');
    await assertNoTypeError('*NaN*', '*NaN*');
    await assertNoTypeError('an integral Number', '*2*<sub>𝔽</sub>');

    await assertTypeError(
      'an integral Number',
      '*0.5*<sub>𝔽</sub>',
      'argument (*0.5*<sub>𝔽</sub>) does not look plausibly assignable to parameter type (integral Number)',
      "returned value (*0.5*<sub>𝔽</sub>) does not look plausibly assignable to algorithm's return type (integral Number)",
    );

    await assertTypeError(
      'a mathematical value',
      '*5*<sub>𝔽</sub>',
      'argument (*5*<sub>𝔽</sub>) does not look plausibly assignable to parameter type (mathematical value)\n' +
        'hint: you passed an ES language Number, but this position takes a mathematical value',
      "returned value (*5*<sub>𝔽</sub>) does not look plausibly assignable to algorithm's return type (mathematical value)\n" +
        'hint: you returned an ES language Number, but this algorithm returns a mathematical value',
    );

    await assertTypeError(
      'an integral Number',
      '5',
      'argument (5) does not look plausibly assignable to parameter type (integral Number)\n' +
        'hint: you passed a mathematical value, but this position takes an ES language Number',
      "returned value (5) does not look plausibly assignable to algorithm's return type (integral Number)\n" +
        'hint: you returned a mathematical value, but this algorithm returns an ES language Number',
    );
  });

  it('time value', async () => {
    await assertTypeError(
      'a time value',
      '~enum-value~',
      'argument (~enum-value~) does not look plausibly assignable to parameter type (integral Number or *NaN*)',
      "returned value (~enum-value~) does not look plausibly assignable to algorithm's return type (integral Number or *NaN*)",
    );

    await assertTypeError(
      'a time value',
      '5',
      'argument (5) does not look plausibly assignable to parameter type (integral Number or *NaN*)\n' +
        'hint: you passed a mathematical value, but this position takes an ES language Number',
      "returned value (5) does not look plausibly assignable to algorithm's return type (integral Number or *NaN*)\n" +
        'hint: you returned a mathematical value, but this algorithm returns an ES language Number',
    );

    await assertNoTypeError('a time value', '*2*<sub>𝔽</sub>');
    await assertNoTypeError('a time value', '*-2*<sub>𝔽</sub>');
    await assertNoTypeError('a time value', '*NaN*');
  });

  it('ES language value', async () => {
    await assertTypeError(
      'an ECMAScript language value',
      '~enum-value~',
      'argument (~enum-value~) does not look plausibly assignable to parameter type (ECMAScript language value)',
      "returned value (~enum-value~) does not look plausibly assignable to algorithm's return type (ECMAScript language value)",
    );

    await assertTypeError(
      'an ECMAScript language value',
      '42',
      'argument (42) does not look plausibly assignable to parameter type (ECMAScript language value)',
      "returned value (42) does not look plausibly assignable to algorithm's return type (ECMAScript language value)",
    );

    await assertTypeError(
      'an ECMAScript language value',
      'NormalCompletion(42)',
      'argument type (a normal completion containing 42) does not look plausibly assignable to parameter type (ECMAScript language value)',
      "type of returned value (a normal completion containing 42) does not look plausibly assignable to algorithm's return type (ECMAScript language value)",
      [completionBiblio],
    );

    await assertNoTypeError('an ECMAScript language value', '*string*');
    await assertNoTypeError('an ECMAScript language value', '*true*');
    await assertNoTypeError('an ECMAScript language value', '*false*');
    await assertNoTypeError('an ECMAScript language value', '*42*<sub>𝔽</sub>');
    await assertNoTypeError('an ECMAScript language value', '*42*<sub>ℤ</sub>');
    await assertNoTypeError('an ECMAScript language value', '*null*');
    await assertNoTypeError('an ECMAScript language value', '*undefined*');
  });

  it('completion', async () => {
    await assertTypeError(
      'either a normal completion containing a Boolean or an abrupt completion',
      '*false*',
      'argument (false) does not look plausibly assignable to parameter type (a normal completion containing Boolean or an abrupt completion)',
      null /* it is legal to return an unwrapped value from an algorithm declared to return a normal completion */,
      [completionBiblio],
    );

    await assertTypeError(
      'a Boolean',
      'NormalCompletion(*false*)',
      'argument type (a normal completion containing false) does not look plausibly assignable to parameter type (Boolean)',
      "type of returned value (a normal completion containing false) does not look plausibly assignable to algorithm's return type (Boolean)",
      [completionBiblio],
    );

    await assertTypeError(
      'a normal completion containing a Number',
      'NormalCompletion(*false*)',
      'argument type (a normal completion containing false) does not look plausibly assignable to parameter type (a normal completion containing Number)',
      "type of returned value (a normal completion containing false) does not look plausibly assignable to algorithm's return type (a normal completion containing Number)",
      [completionBiblio],
    );

    await assertNoTypeError(
      'either a normal completion containing a Boolean or an abrupt completion',
      'NormalCompletion(*false*)',
      [completionBiblio],
    );

    await assertNoTypeError(
      'either a normal completion containing an ECMAScript language value or an abrupt completion',
      'NormalCompletion(*false*)',
      [completionBiblio],
    );

    await assertNoTypeError('a Boolean', '! Throwy()', [completionBiblio]);
  });

  it('call', async () => {
    let biblio = await getBiblio(`
      <emu-clause id="sec-returns-number" type="abstract operation">
        <h1>
          ReturnsNumber (): a Number
        </h1>
        <dl class="header"></dl>
        <emu-alg>
          1. Return *1*<sub>𝔽</sub>.
        </emu-alg>
      </emu-clause>

      <emu-clause id="sec-returns-completion-number" type="abstract operation">
        <h1>
          ReturnsCompletionOfNumber (): either a normal completion containing a Number or a throw completion
        </h1>
        <dl class="header"></dl>
        <emu-alg>
          1. Return NormalCompletion(*1*<sub>𝔽</sub>).
        </emu-alg>
      </emu-clause>
    `);

    await assertTypeError(
      'a String',
      'ReturnsNumber()',
      'argument type (Number) does not look plausibly assignable to parameter type (String)',
      "type of returned value (Number) does not look plausibly assignable to algorithm's return type (String)",
      [biblio],
    );

    await assertTypeError(
      'a String',
      '! ReturnsCompletionOfNumber()',
      'argument type (Number) does not look plausibly assignable to parameter type (String)',
      "type of returned value (Number) does not look plausibly assignable to algorithm's return type (String)",
      [biblio],
    );

    await assertNoTypeError('a Number', 'ReturnsNumber()', [biblio]);

    await assertNoTypeError('a Number', '? ReturnsCompletionOfNumber()', [biblio]);
  });

  it('non-strict type overlap', async () => {
    let biblio = await getBiblio(`
      <emu-clause id="sec-returns-number" type="abstract operation">
        <h1>
          ReturnsListOfNumberOrString (): a List of either Numbers or Strings
        </h1>
        <dl class="header"></dl>
        <emu-alg>
          1. Return *1*<sub>𝔽</sub>.
        </emu-alg>
      </emu-clause>
    `);

    await assertTypeError(
      'an integer',
      'ReturnsListOfNumberOrString()',
      'argument type (List of Number or String) does not look plausibly assignable to parameter type (integer)',
      "type of returned value (List of Number or String) does not look plausibly assignable to algorithm's return type (integer)",
      [biblio],
    );

    await assertNoTypeError('List of Strings', 'ReturnsListOfNumberOrString()', [biblio]);
  });

  it('list', async () => {
    await assertTypeError(
      'a String',
      '« »',
      'argument type (empty List) does not look plausibly assignable to parameter type (String)',
      "type of returned value (empty List) does not look plausibly assignable to algorithm's return type (String)",
    );

    await assertTypeError(
      'a List of Strings',
      '« 0.5 »',
      'argument type (List of 0.5) does not look plausibly assignable to parameter type (List of String)',
      "type of returned value (List of 0.5) does not look plausibly assignable to algorithm's return type (List of String)",
    );

    await assertNoTypeError('a List of Strings', '« "something" »');

    await assertNoTypeError('a List of Strings', '« »');
  });

  it('integers', async () => {
    await assertTypeError(
      '0',
      '1',
      'argument (1) does not look plausibly assignable to parameter type (0)',
      "returned value (1) does not look plausibly assignable to algorithm's return type (0)",
    );
    await assertTypeError(
      'a positive integer',
      '0',
      'argument (0) does not look plausibly assignable to parameter type (positive integer)',
      "returned value (0) does not look plausibly assignable to algorithm's return type (positive integer)",
    );
    await assertTypeError(
      'a non-negative integer',
      '-1',
      'argument (-1) does not look plausibly assignable to parameter type (non-negative integer)',
      "returned value (-1) does not look plausibly assignable to algorithm's return type (non-negative integer)",
    );
    await assertTypeError(
      'a negative integer',
      '0',
      'argument (0) does not look plausibly assignable to parameter type (negative integer)',
      "returned value (0) does not look plausibly assignable to algorithm's return type (negative integer)",
    );

    await assertNoTypeError('a mathematical value', '0');
    await assertNoTypeError('an integer', '0');
    await assertNoTypeError('a non-negative integer', '0');
    await assertNoTypeError('a positive integer', '1');
    await assertNoTypeError('a negative integer', '-1');
    await assertNoTypeError('0', '0');
    await assertNoTypeError('1', '1');
    await assertNoTypeError('-1', '-1');
    await assertNoTypeError('0 or 1', '0');
    await assertNoTypeError('0 or 1', '1');
  });

  it('strings', async () => {
    await assertTypeError(
      '"type"',
      '*"value"*',
      'argument ("value") does not look plausibly assignable to parameter type ("type")',
      'returned value ("value") does not look plausibly assignable to algorithm\'s return type ("type")',
    );

    await assertNoTypeError('"a"', '*"a"*');
    await assertNoTypeError('"b"', '*"b"*');
    await assertNoTypeError('"a" or "b"', '*"a"*');
    await assertNoTypeError('"a" or "b"', '*"b"*');
  });

  it('unknown types', async () => {
    await assertNoTypeError('a Foo', 'something');
    await assertNoTypeError('a Foo', '42');
    await assertNoTypeError('an integer', 'something');
  });
});

describe('error location', () => {
  it('handles entities', async () => {
    await assertLint(
      positioned`
        <emu-clause id="example" type="abstract operation">
          <h1>
            Example (
              _x_: a List of integers,
              _y_: an integer,
            ): ~unused~
          </h1>
          <dl class="header"></dl>
        </emu-clause>
        <emu-alg>
          1. Perform Example(&laquo; 0 &raquo;, ${M}~enum~).
        </emu-alg>
      `,
      {
        ruleId: 'typecheck',
        nodeType: 'emu-alg',
        message: 'argument (~enum~) does not look plausibly assignable to parameter type (integer)',
      },
    );
  });
});

describe('skip return checks', () => {
  it('respects the "skip return checks" attribute', async () => {
    await assertLintFree(`
      <emu-clause id="sec-completion-ao" type="abstract operation">
        <h1>
          Completion (
            _completionRecord_: a Completion Record,
          ): a Completion Record
        </h1>
        <dl class="header">
          <dt>skip return checks</dt>
          <dd>true</dd>
        </dl>
        <emu-alg>
          1. Assert: _completionRecord_ is a Completion Record.
          1. Return _completionRecord_.
        </emu-alg>
      </emu-clause>
    `);

    await assertLintFree(`
      <emu-clause id="example" type="abstract operation">
        <h1>
          ExampleAlg (): either a normal completion containing a Number or an abrupt completion
        </h1>
        <dl class="header">
          <dt>skip return checks</dt>
          <dd>true</dd>
        </dl>
        <emu-alg>
          1. Let _foo_ be 0.
          1. Return _foo_.
        </emu-alg>
      </emu-clause>
    `);
  });

  it('warns when the "skip return checks" attribute is unnecessary', async () => {
    await assertLint(
      positioned`
        <emu-clause id="example" type="abstract operation">
          <h1>
            ExampleAlg (): a mathematical value
          </h1>
          <dl class="header">
            <dt>skip return checks</dt>
            <dd>true</dd>
          </dl>
          ${M}<emu-alg>
            1. Let _foo_ be 0.
            1. Return _foo_.
          </emu-alg>
        </emu-clause>
      `,
      {
        ruleId: 'unnecessary-attribute',
        nodeType: 'emu-alg',
        message:
          'this algorithm has the "skip return check" attribute, but there is nothing which would cause an issue if it were removed',
      },
    );
  });
});

describe('special cases', () => {
  it('NormalCompletion takes one argument', async () => {
    await assertLint(
      positioned`
        <emu-clause id="sec-normalcompletion" type="abstract operation" aoid="NormalCompletion">
          <h1>NormalCompletion ( )</h1>
        </emu-clause>

        <emu-clause id="takesnormalcompletion" type="abstract operation">
          <h1>
            TakesCompletion (
              _x_: a normal completion or an abrupt completion
            ): ~unused~
          </h1>
          <dl class="header">
          </dl>
          <emu-alg>
            1. Do something with _x_.
          </emu-alg>
        </emu-clause>

        <emu-clause id="example" type="abstract operation">
          <h1>Example ()</h1>
          <dl class="header">
          </dl>
          <emu-alg>
            1. Perform TakesCompletion(${M}NormalCompletion()).
          </emu-alg>
        </emu-clause>
      `,
      {
        ruleId: 'typecheck',
        nodeType: 'emu-alg',
        message: 'expected NormalCompletion to be passed exactly one argument',
      },
    );
  });

  it('NormalCompletion takes one argument', async () => {
    await assertLint(
      positioned`
        <emu-clause id="sec-completion" type="abstract operation" aoid="Completion">
          <h1>Completion ( )</h1>
        </emu-clause>

        <emu-clause id="takesnormalcompletion" type="abstract operation">
          <h1>
            TakesCompletion (
              _x_: a normal completion or an abrupt completion
            ): ~unused~
          </h1>
          <dl class="header">
          </dl>
          <emu-alg>
            1. Do something with _x_.
          </emu-alg>
        </emu-clause>

        <emu-clause id="example" type="abstract operation">
          <h1>Example ()</h1>
          <dl class="header">
          </dl>
          <emu-alg>
            1. Perform TakesCompletion(${M}Completion()).
          </emu-alg>
        </emu-clause>
      `,
      {
        ruleId: 'typecheck',
        nodeType: 'emu-alg',
        message: 'expected Completion to be passed exactly one argument',
      },
    );
  });
});

describe('concrete method vs abstract method agreement', () => {
  let biblio;
  before(async () => {
    biblio = await getBiblio(`
      <emu-clause id="abstract-methods">
        <h1>Abstract Methods</h1>
        <emu-table type="abstract methods" of="Something">
          <table>
            <tr>
              <td>
                SomeMethod (
                  _foo_: a String
                ): either a normal completion containing a String or a throw completion
              </td>
              <td></td>
            </tr>
          </table>
        </emu-table>
      </emu-clause>
    `);
  });

  it('signature length mismatch', async () => {
    await assertLint(
      positioned`
        <emu-clause id="sec-concrete-somemethod" type="concrete method">
          ${M}<h1>SomeMethod (
            _foo_: a String,
            _bar_: a String,
          ): either a normal completion containing a String or a throw completion</h1>
          <dl class="header">
            <dt>for</dt>
            <dd>a sample _foo_</dd>
          </dl>

          <emu-alg>
            1. Return ~unused~.
          </emu-alg>
        </emu-clause>
      `,
      {
        ruleId: 'concrete-method-base',
        nodeType: 'h1',
        message:
          'signature for concrete method SomeMethod differs from the signature for the corresponding abstract method: base signature has 1 parameters but derived signature has 2 parameters',
      },
      {
        extraBiblios: [biblio],
      },
    );
  });

  it('signature type mismatch', async () => {
    await assertLint(
      positioned`
        <emu-clause id="sec-concrete-somemethod" type="concrete method">
          ${M}<h1>SomeMethod (
            _foo_: a Number,
          ): either a normal completion containing a String or a throw completion</h1>
          <dl class="header">
            <dt>for</dt>
            <dd>a sample _foo_</dd>
          </dl>

          <emu-alg>
            1. Return ~unused~.
          </emu-alg>
        </emu-clause>
      `,
      {
        ruleId: 'concrete-method-base',
        nodeType: 'h1',
        message:
          "signature for concrete method SomeMethod differs from the signature for the corresponding abstract method: the 1st parameter's type differs in the base signature (String) vs in the derived signature (Number)",
      },
      {
        extraBiblios: [biblio],
      },
    );
  });

  it('parameter name mismatch', async () => {
    await assertLint(
      positioned`
        <emu-clause id="sec-concrete-somemethod" type="concrete method">
          ${M}<h1>SomeMethod (
            _bar_: a String,
          ): either a normal completion containing a String or a throw completion</h1>
          <dl class="header">
            <dt>for</dt>
            <dd>a sample _foo_</dd>
          </dl>

          <emu-alg>
            1. Return ~unused~.
          </emu-alg>
        </emu-clause>
      `,
      {
        ruleId: 'concrete-method-base',
        nodeType: 'h1',
        message:
          'signature for concrete method SomeMethod differs from the signature for the corresponding abstract method: base signature calls the 1st parameter _foo_ but derived signature calls it _bar_',
      },
      {
        extraBiblios: [biblio],
      },
    );
  });

  it('return type mismatch', async () => {
    await assertLint(
      positioned`
        <emu-clause id="sec-concrete-somemethod" type="concrete method">
          ${M}<h1>SomeMethod (
            _foo_: a String,
          ): a String</h1>
          <dl class="header">
            <dt>for</dt>
            <dd>a sample _foo_</dd>
          </dl>

          <emu-alg>
            1. Return ~unused~.
          </emu-alg>
        </emu-clause>
      `,
      {
        ruleId: 'concrete-method-base',
        nodeType: 'h1',
        message:
          'signature for concrete method SomeMethod differs from the signature for the corresponding abstract method: the return type in the base signature (a normal completion containing String or an abrupt completion) is not a generalization of the return type in the derived signature (String)',
      },
      {
        extraBiblios: [biblio],
      },
    );
  });

  it('negative: identical types', async () => {
    await assertLintFree(
      `
      <emu-clause id="sec-concrete-somemethod" type="concrete method">
        <h1>SomeMethod (
          _foo_: a String,
        ): either a normal completion containing a String or a throw completion</h1>
        <dl class="header">
          <dt>for</dt>
          <dd>a sample _foo_</dd>
        </dl>

        <emu-alg>
          1. Return ~unused~.
        </emu-alg>
      </emu-clause>
    `,
      {
        extraBiblios: [biblio],
      },
    );
  });

  it('negative: return type is refinement', async () => {
    await assertLintFree(
      `
      <emu-clause id="sec-concrete-somemethod" type="concrete method">
        <h1>SomeMethod (
          _foo_: a String,
        ): a normal completion containing a String</h1>
        <dl class="header">
          <dt>for</dt>
          <dd>a sample _foo_</dd>
        </dl>

        <emu-alg>
          1. Return ~unused~.
        </emu-alg>
      </emu-clause>
    `,
      {
        extraBiblios: [biblio],
      },
    );
  });
});
