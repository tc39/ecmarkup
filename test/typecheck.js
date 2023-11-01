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
      <emu-clause id="normal-completion" type="abstract operation">
        <h1>NormalCompletion ( _x_ )</h1>
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
    `);
  });

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
        }
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
        }
      );
    });

    it('negative', async () => {
      await assertLintFree(
        `
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
        }
      );
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
          1. Return ? ${M}ExampleAlg().
        </emu-alg>
        </emu-clause>
        `,
        {
          ruleId: 'typecheck',
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
          1. Let _foo_ be 0.
          1. Return ${M}? _foo_.
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
          1. ${M}Throw a *TypeError* exception.
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
          1. If some condition is met, ${M}throw a *TypeError* exception.
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
          1. Let _foo_ be a thing.
          1. ${M}Throw _foo_.
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
          1. Let _x_ be 0.
          1. ${M}Return Completion(_x_).
        </emu-alg>
        </emu-clause>
        `,
        {
          ruleId: 'completiony-thing-in-non-completion-algorithm',
          nodeType: 'emu-alg',
          message:
            'this would return a Completion Record, but the containing AO is declared not to return a Completion Record',
        },
        {
          extraBiblios: [biblio],
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
          1. Let _x_ be 0.
          1. ${M}Return Completion Record { [[Type]]: ~return~, [[Value]]: _x_, [[Target]]: ~empty~ }.
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
        }
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
            1. Do something with Completion(0).
            1. NOTE: This will not throw a *TypeError* exception.
            1. Consider whether something is a return completion.
          </emu-alg>
          </emu-clause>
        `,
        {
          extraBiblios: [biblio],
        }
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
          1. Let _foo_ be 0.
          1. Return ? _foo_.
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
            'every call site of ExampleAlg asserts the return value is a normal completion; it should be refactored to not return a completion record at all. if this AO is called in other documents, add the "called externally" attribute to the header.',
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
            <dt>called externally</dt>
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
        }
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
        }
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
      }
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
      }
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
      }
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
      }
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
      }
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
      }
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
      }
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
      }
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
      }
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
      }
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
      }
    );

    await assertLintFree(
      `
        <emu-alg>
          1. Return DelExample(*"y"*, *"z"*, *"w"*).
        </emu-alg>
      `,
      {
        extraBiblios: [biblio],
      }
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
      }
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
      }
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
      }
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
      }
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
      }
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
      }
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
      }
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
      }
    );
  });
});
