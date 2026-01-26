'use strict';

let {
  assertLint,
  assertLintFree,
  positioned,
  lintLocationMarker: M,
  getBiblio,
} = require('./utils.js');

describe('variables are declared and used appropriately', () => {
  describe('variables must be declared', () => {
    it('variables must be declared', async () => {
      await assertLint(
        positioned`
          <emu-alg>
            1. Let _x_ be 0.
            1. Something with _x_ and ${M}_y_.
          </emu-alg>
        `,
        {
          ruleId: 'use-before-def',
          nodeType: 'emu-alg',
          message: 'could not find a preceding declaration for "y"',
        },
      );
    });

    it('loop variables are not visible after the loop', async () => {
      await assertLint(
        positioned`
          <emu-alg>
            1. For each integer _k_ less than 10, do
              1. Something with _k_.
            1. Something with ${M}_k_.
          </emu-alg>
        `,
        {
          ruleId: 'use-before-def',
          nodeType: 'emu-alg',
          message: 'could not find a preceding declaration for "k"',
        },
      );
    });

    it('abstract closure captures must be declared', async () => {
      await assertLint(
        positioned`
          <emu-alg>
            1. Let _closure_ be a new Abstract Closure with no parameters that captures ${M}_undeclared_ and performs the following steps when called:
              1. Do something with _undeclared_.
              1. Return *undefined*.
            1. Return _closure_.
          </emu-alg>
        `,
        {
          ruleId: 'use-before-def',
          nodeType: 'emu-alg',
          message: 'could not find a preceding declaration for "undeclared"',
        },
      );
    });

    it('abstract closures must capture their values', async () => {
      await assertLint(
        positioned`
          <emu-alg>
            1. Let _v_ be 0.
            1. Let _closure_ be a new Abstract Closure with no parameters that captures nothing and performs the following steps when called:
              1. Do something with ${M}_v_.
              1. Return *undefined*.
            1. Do something with _v_ so it does not seem unused.
            1. Return _closure_.
          </emu-alg>
        `,
        {
          ruleId: 'use-before-def',
          nodeType: 'emu-alg',
          message: 'could not find a preceding declaration for "v"',
        },
      );
    });

    it('abstract closure captures must be used', async () => {
      await assertLint(
        positioned`
          <emu-alg>
            1. Let _outer_ be 0.
            1. Let _closure_ be a new Abstract Closure with no parameters that captures ${M}_outer_ and performs the following steps when called:
              1. Return *undefined*.
            1. Return _closure_.
          </emu-alg>
        `,
        {
          ruleId: 'unused-capture',
          nodeType: 'emu-alg',
          message: 'closure captures "outer", but never uses it',
        },
      );
    });

    it('"there exists _x_ in _y_ such that" declares _x_ but not _y_"', async () => {
      await assertLint(
        positioned`
          <emu-alg>
            1. If there exists an integer _x_ in ${M}_y_ such that _x_ < 10, return *true*.
            1. Return *false*.
          </emu-alg>
        `,
        {
          ruleId: 'use-before-def',
          nodeType: 'emu-alg',
          message: 'could not find a preceding declaration for "y"',
        },
      );
    });

    it('"there exists a value in _x_ with a property" does not declare _x_"', async () => {
      await assertLint(
        positioned`
          <emu-alg>
            1. If there exists an integer in ${M}_x_ greater than 0, return *true*.
            1. Return *false*.
          </emu-alg>
        `,
        {
          ruleId: 'use-before-def',
          nodeType: 'emu-alg',
          message: 'could not find a preceding declaration for "x"',
        },
      );
    });

    it('variables in a loop header other than the loop variable must be declared', async () => {
      await assertLint(
        positioned`
          <emu-alg>
            1. Let _c_ be a variable.
            1. For each integer _a_ of ${M}_b_ such that _c_ relates to _a_ in some way, do
              1. Something.
          </emu-alg>
        `,
        {
          ruleId: 'use-before-def',
          nodeType: 'emu-alg',
          message: 'could not find a preceding declaration for "b"',
        },
      );

      await assertLint(
        positioned`
          <emu-alg>
            1. Let _b_ be a variable.
            1. For each integer _a_ of _b_ such that ${M}_c_ relates to _a_ in some way, do
              1. Something.
          </emu-alg>
        `,
        {
          ruleId: 'use-before-def',
          nodeType: 'emu-alg',
          message: 'could not find a preceding declaration for "c"',
        },
      );
    });

    it('explicit "declared" annotations should not be redundant', async () => {
      await assertLint(
        positioned`
          <emu-alg>
            1. Let _y_ be 0.
            1. [declared="x,${M}y"] Return _x_ + _y_.
          </emu-alg>
        `,
        {
          ruleId: 'unnecessary-declared-var',
          nodeType: 'emu-alg',
          message: '"y" is already declared and does not need an explict annotation',
        },
      );
    });
  });

  describe('variables must be used', () => {
    it('variables must be used', async () => {
      await assertLint(
        positioned`
          <emu-alg>
            1. Let _x_ be 0.
            1. Let ${M}_y_ be 1.
            1. Return « _x_ ».
          </emu-alg>
        `,
        {
          ruleId: 'unused-declaration',
          nodeType: 'emu-alg',
          message: '"y" is declared here, but never referred to',
        },
      );
    });
  });

  describe('valid declaration + use', () => {
    it('declarations are visible', async () => {
      await assertLintFree(
        `
          <emu-alg>
            1. Let _x_ be 0.
            1. Return _x_.
          </emu-alg>
        `,
      );
    });

    it('declarations from a nested if/else are visible', async () => {
      await assertLintFree(
        `
          <emu-alg>
            1. If condition, let _result_ be 0.
            1. Else, let _result_ be 1.
            1. Return _result_.
          </emu-alg>
        `,
      );

      await assertLintFree(
        `
          <emu-alg>
            1. If condition, then
              1. Let _result_ be 0.
            1. Else,
              1. Let _result_ be 1.
            1. Return _result_.
          </emu-alg>
        `,
      );
    });

    it('declarations from built-in function parameters are visible', async () => {
      await assertLintFree(
        `
          <emu-clause id="sec-array.prototype.unshift">
            <h1>Array.prototype.unshift ( ..._items_ )</h1>
            <p>It performs the following steps when called:</p>
            <emu-alg>
              1. Let _argCount_ be the number of elements in _items_.
              1. Do something with _argCount_.
            </emu-alg>
          </emu-clause>
        `,
      );
    });

    it('declarations from free-form headers are visible', async () => {
      await assertLintFree(
        `
          <emu-clause id="sec-valid-chosen-reads">
            <h1>Valid Chosen Reads</h1>
            <p>A candidate execution _execution_ has valid chosen reads if the following algorithm returns *true*.</p>
            <emu-alg>
              1. If some condition of _execution_, return *true*.
              1. Return *false*.
            </emu-alg>
          </emu-clause>
        `,
      );
    });

    it('declarations from free-form headers are visible even when the algorithm is nested', async () => {
      await assertLintFree(
        `
          <emu-clause id="sec-valid-chosen-reads">
            <h1>Valid Chosen Reads</h1>
            <p>A candidate execution _execution_ has valid chosen reads if the following algorithm returns *true*.</p>
            <table>
              <tr>
              <td>
              <emu-alg>
                1. If some condition of _execution_, return *true*.
                1. Return *false*.
              </emu-alg>
              </td>
              <td>
              <emu-alg>
                1. If some condition of _execution_, return *true*.
                1. Return *false*.
              </emu-alg>
              </td>
              </tr>
            </table>
          </emu-clause>
        `,
      );
    });

    it('the receiver for concrete methods is visible', async () => {
      await assertLintFree(
        `
          <emu-clause id="abstract-methods">
            <h1>Abstract Methods</h1>
            <emu-table type="abstract methods" of="Declarative Environment Record">
              <table>
                <tr>
                  <td>
                    HasBinding (
                      _N_: a String
                    ): a Boolean
                  </td>
                  <td></td>
                </tr>
              </table>
            </emu-table>
          </emu-clause>

          <emu-clause id="sec-declarative-environment-records-hasbinding-n" type="concrete method">
            <h1>HasBinding ( _N_ )</h1>
            <dl class="header">
              <dt>for</dt>
              <dd>a Declarative Environment Record _envRec_</dd>
            </dl>
            <emu-alg>
              1. If _envRec_ has a binding for the name that is the value of _N_, return *true*.
              1. Return *false*.
            </emu-alg>
          </emu-clause>
        `,
      );
    });

    it('abstract closure parameters must be a parenthesized list of variables', async () => {
      await assertLint(
        positioned`
          <emu-clause id="sec-object.fromentries">
          <h1>Object.fromEntries ( _obj_ )</h1>
          <emu-alg>
            1. Let _closure_ be a new Abstract Closure with parameters ${M}« _x_ » that captures nothing and performs the following steps when called:
              1. Do something with _x_.
              1. Return *undefined*.
            1. Return _closure_.
          </emu-alg>
        </emu-clause>
        `,
        {
          ruleId: 'bad-ac',
          nodeType: 'emu-alg',
          message: 'expected to find a parenthesized list of parameter names here',
        },
      );

      await assertLint(
        positioned`
          <emu-clause id="sec-object.fromentries">
          <h1>Object.fromEntries ( _obj_ )</h1>
          <emu-alg>
            1. Let _closure_ be a new Abstract Closure with parameters (${M}x) that captures nothing and performs the following steps when called:
              1. Do something with _x_.
              1. Return *undefined*.
            1. Return _closure_.
          </emu-alg>
        </emu-clause>
        `,
        {
          ruleId: 'bad-ac',
          nodeType: 'emu-alg',
          message: 'expected to find a parameter name here',
        },
      );

      await assertLint(
        positioned`
          <emu-clause id="sec-object.fromentries">
          <h1>Object.fromEntries ( _obj_ )</h1>
          <emu-alg>
            1. Let _closure_ be a new Abstract Closure with parameters (_x_${M} _y_) that captures nothing and performs the following steps when called:
              1. Do something with _x_.
              1. Return *undefined*.
            1. Return _closure_.
          </emu-alg>
        </emu-clause>
        `,
        {
          ruleId: 'bad-ac',
          nodeType: 'emu-alg',
          message: 'expected to find ", " here',
        },
      );
    });

    it('abstract closure parameters/captures are visible', async () => {
      await assertLintFree(
        `
          <emu-clause id="sec-object.fromentries">
          <h1>Object.fromEntries ( _obj_ )</h1>
          <emu-alg>
            1. Let _closure_ be a new Abstract Closure with parameters (_key_, _value_) that captures _obj_ and performs the following steps when called:
              1. Do something with _obj_, _key_, and _value_.
              1. Return *undefined*.
            1. Return _closure_.
          </emu-alg>
        </emu-clause>
        `,
      );
    });

    it('abstract closure parameters/captures are visible', async () => {
      await assertLintFree(
        `
          <emu-clause id="sec-object.fromentries">
          <h1>Object.fromEntries ( <del>_del_</del><ins>_obj_</ins> )</h1>
          <emu-alg>
            1. Let _closure_ be a new Abstract Closure with parameters (_key_, _value_) that captures _obj_ and performs the following steps when called:
              1. Do something with _obj_, _key_, and _value_.
              1. Return *undefined*.
            1. Return _closure_.
          </emu-alg>
        </emu-clause>
        `,
      );
    });

    it('abstract closure rest parameters must be last', async () => {
      await assertLint(
        positioned`
          <emu-clause id="sec-object.fromentries">
          <h1>Object.fromEntries ( _obj_ )</h1>
          <emu-alg>
            1. Let _closure_ be a new Abstract Closure with parameters (${M}..._x_, _y_) that captures nothing and performs the following steps when called:
              1. Do something with _x_.
              1. Return *undefined*.
            1. Return _closure_.
          </emu-alg>
        </emu-clause>
        `,
        {
          ruleId: 'bad-ac',
          nodeType: 'emu-alg',
          message: 'expected rest param to come last',
        },
      );

      await assertLint(
        positioned`
          <emu-clause id="sec-object.fromentries">
          <h1>Object.fromEntries ( _obj_ )</h1>
          <emu-alg>
            1. Let _closure_ be a new Abstract Closure with parameters (${M}..._x_,) that captures nothing and performs the following steps when called:
              1. Do something with _x_.
              1. Return *undefined*.
            1. Return _closure_.
          </emu-alg>
        </emu-clause>
        `,
        {
          ruleId: 'bad-ac',
          nodeType: 'emu-alg',
          message: 'expected rest param to come last',
        },
      );
    });

    it('abstract closure rest parameters must be variables', async () => {
      await assertLint(
        positioned`
          <emu-clause id="sec-object.fromentries">
          <h1>Object.fromEntries ( _obj_ )</h1>
          <emu-alg>
            1. Let _closure_ be a new Abstract Closure with parameters (${M}...x) that captures nothing and performs the following steps when called:
              1. Do something with _x_.
              1. Return *undefined*.
            1. Return _closure_.
          </emu-alg>
        </emu-clause>
        `,
        {
          ruleId: 'bad-ac',
          nodeType: 'emu-alg',
          message: 'expected to find a parameter name here',
        },
      );

      await assertLint(
        positioned`
          <emu-clause id="sec-object.fromentries">
          <h1>Object.fromEntries ( _obj_ )</h1>
          <emu-alg>
            1. Let _closure_ be a new Abstract Closure with parameters (${M}..._x_,) that captures nothing and performs the following steps when called:
              1. Do something with _x_.
              1. Return *undefined*.
            1. Return _closure_.
          </emu-alg>
        </emu-clause>
        `,
        {
          ruleId: 'bad-ac',
          nodeType: 'emu-alg',
          message: 'expected rest param to come last',
        },
      );
    });

    it('abstract closure rest parameters are visible', async () => {
      await assertLintFree(
        `
          <emu-clause id="sec-object.fromentries">
          <h1>Object.fromEntries ( _obj_ )</h1>
          <emu-alg>
            1. Let _closure_ be a new Abstract Closure with parameters (..._x_) that captures nothing and performs the following steps when called:
              1. Do something with _x_.
              1. Return *undefined*.
            1. Return _closure_.
          </emu-alg>
        </emu-clause>
        `,
      );
    });

    it('multiple declarations are visible', async () => {
      await assertLintFree(
        `
          <emu-alg>
            1. Let _x_, _y_, and _z_ be some values.
            1. Return _x_ + _y_ + _z_.
          </emu-alg>
        `,
      );
    });

    it('"such that" counts as a declaration"', async () => {
      await assertLintFree(
        `
          <emu-alg>
            1. If there is an integer _x_ such that _x_ < 10, return *true*.
            1. Return *false*.
          </emu-alg>
        `,
      );

      await assertLintFree(
        `
          <emu-alg>
            1. If there are integers _x_ and _y_ such that _x_ < _y_, return *true*.
            1. Return *false*.
          </emu-alg>
        `,
      );
    });

    it('"there exists" counts as a declaration"', async () => {
      await assertLintFree(
        `
          <emu-alg>
            1. If there exists an integer _x_ between 0 and 10, return _x_.
            1. Return -1.
          </emu-alg>
        `,
      );
    });

    it('"for some" counts as a declaration"', async () => {
      await assertLintFree(
        `
          <emu-alg>
            1. If some property of _i_ holds for some integer _i_ in the interval from 0 to 10, return _i_.
            1. Return -1.
          </emu-alg>
        `,
      );
    });

    it('declarations from explicit attributes are visible', async () => {
      await assertLintFree(
        `
          <emu-clause id="sec-array.prototype.unshift">
            <h1>Array.prototype.unshift ( ..._items_ )</h1>
            <p>It performs the following steps when called:</p>
            <emu-alg>
              1. [declared="x,y"] Do something with _x_ and _y_.
            </emu-alg>
          </emu-clause>
        `,
      );
    });

    it('loop variables are visible within the loop', async () => {
      let biblio = await getBiblio(`
        <emu-grammar type="definition">
          CaseClause : \`a\`
        </emu-grammar>
      `);

      await assertLintFree(
        `
          <emu-alg>
            1. For each |CaseClause| _c_ of some list, do
              1. Something with _c_.
          </emu-alg>
        `,
        { extraBiblios: [biblio] },
      );

      await assertLintFree(
        `
          <emu-alg>
            1. For each Record { [[Type]], [[Value]] } _c_ of some list, do
              1. Something with _c_.
          </emu-alg>
        `,
        { extraBiblios: [biblio] },
      );
    });
  });
});

describe('variables cannot be redeclared', () => {
  it('redeclaration at the same level is an error', async () => {
    await assertLint(
      positioned`
        <emu-alg>
          1. Let _x_ be 0.
          1. Let ${M}_x_ be 1.
          1. Return _x_.
        </emu-alg>
      </emu-clause>
      `,
      {
        ruleId: 're-declaration',
        nodeType: 'emu-alg',
        message: '"x" is already declared',
      },
    );
  });

  it('redeclaration at an inner level is an error', async () => {
    await assertLint(
      positioned`
        <emu-alg>
          1. Let _x_ be 0.
          1. Repeat,
            1. Let ${M}_x_ be 1.
          1. Return _x_.
        </emu-alg>
      </emu-clause>
      `,
      {
        ruleId: 're-declaration',
        nodeType: 'emu-alg',
        message: '"x" is already declared',
      },
    );
  });

  it('multi-line if-else does not count as redeclaration', async () => {
    await assertLintFree(
      `
      <emu-alg>
        1. If condition, then
          1. Let _result_ be 0.
        1. Else,
          1. Let _result_ be 1.
        1. Return _result_.
      </emu-alg>
      `,
    );
  });

  it('single-line if-else does not count as redeclaration', async () => {
    await assertLintFree(
      `
      <emu-alg>
        1. If condition, let _result_ be 0.
        1. Else, let _result_ be 1.
        1. Return _result_.
      </emu-alg>
      `,
    );
  });

  it('[declared] annotation can be redeclared', async () => {
    await assertLintFree(
      `
      <emu-alg>
        1. [declared="var"] NOTE: Something about _var_.
        1. Let _var_ be 0.
        1. Return _var_.
      </emu-alg>
      `,
    );
  });

  it('variables mentioned in the premable can be redeclared', async () => {
    await assertLintFree(
      `
      <emu-clause id="example">
        <h1>Example</h1>
        <p>In the following algorithm, _var_ is a variable.</p>
        <emu-alg>
          1. Let _var_ be 0.
          1. Return _var_.
        </emu-alg>
      </emu-clause>
      `,
    );
  });
});
