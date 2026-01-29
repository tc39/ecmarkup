'use strict';

let { describe, it } = require('node:test');
let {
  assertLint,
  assertLintFree,
  positioned,
  lintLocationMarker: M,
  getBiblio,
} = require('./utils.js');

describe('linting whole program', () => {
  describe('grammar validity', () => {
    it('unused parameters', async () => {
      await assertLint(
        positioned`
          <emu-grammar type="definition">
            Statement[${M}a]: \`;\`
          </emu-grammar>
        `,
        {
          ruleId: 'grammarkdown:2008',
          nodeType: 'emu-grammar',
          message: "Parameter 'a' is unused",
        },
      );
    });

    it('parameters used in SDO', async () => {
      await assertLintFree(`
        <emu-grammar type="definition">
          Statement[a]: \`;\`
        </emu-grammar>
        <emu-clause id="example">
        <h1>Static Semantics: Early Errors</h1>
          <emu-grammar>Statement[a]: \`;\`</emu-grammar>
          <ul>
            <li>
              It is a Syntax Error if this production has an <sub>[a]</sub> parameter.
            </li>
          </ul>
        </emu-clause>
      `);
    });

    it('missing parameters', async () => {
      await assertLint(
        positioned`
          <emu-grammar type="definition">
            Foo[a]:
              [+a] \`a\`
              \`b\`

            Bar: ${M}Foo
          </emu-grammar>
        `,
        {
          ruleId: 'grammarkdown:2007',
          nodeType: 'emu-grammar',
          message: "There is no argument given for parameter 'a'",
        },
      );
    });

    it('error in inline grammar', async () => {
      await assertLint(
        positioned`
          <emu-grammar type="definition">Statement[${M}a]: \`;\`</emu-grammar>
        `,
        {
          ruleId: 'grammarkdown:2008',
          nodeType: 'emu-grammar',
          message: "Parameter 'a' is unused",
        },
      );
    });

    it('unknown nonterminal', async () => {
      await assertLint(
        positioned`
          <emu-grammar type="definition">
            Foo: ${M}Bar
          </emu-grammar>
        `,
        {
          ruleId: 'grammarkdown:2000',
          nodeType: 'emu-grammar',
          message: "Cannot find name: 'Bar'",
        },
      );
    });

    it('negative: nonterminal defined upstream', async () => {
      let upstream = await getBiblio(`
        <emu-grammar type="definition">
          Bar: \`a\`
        </emu-grammar>
      `);

      await assertLintFree(
        `
          <emu-grammar type="definition">
            Foo: Bar
          </emu-grammar>
        `,
        {
          extraBiblios: [upstream],
        },
      );
    });
  });

  describe('early error shape', () => {
    it('missing grammar', async () => {
      await assertLint(
        positioned`
          <emu-grammar type="definition">
            Foo : \`a\`
          </emu-grammar>
          <emu-clause id="example">
            <h1>Static Semantics: Early Errors</h1>
            ${M}<ul>
              <li>It is an Early Error sometimes.</li>
            </ul>
          </emu-clause>
          `,
        {
          ruleId: 'early-error-shape',
          nodeType: 'ul',
          message: 'unrecognized structure for early errors: <ul> without preceding <emu-grammar>',
        },
      );
    });

    it('missing UL', async () => {
      await assertLint(
        positioned`
          <emu-grammar type="definition">
            Foo : \`a\`
          </emu-grammar>
          ${M}<emu-clause id="example">
            <h1>Static Semantics: Early Errors</h1>
            <emu-grammar>Foo : \`a\`</emu-grammar>
            <emu-alg>
              1. Some logic.
            </emu-alg>
          </emu-clause>
          `,
        {
          ruleId: 'early-error-shape',
          nodeType: 'emu-clause',
          message: 'unrecognized structure for early errors: no <ul> of errors',
        },
      );
    });

    it('multiple grammars', async () => {
      await assertLint(
        positioned`
          <emu-grammar type="definition">
            Foo : \`a\`
          </emu-grammar>
          <emu-clause id="example">
            <h1>Static Semantics: Early Errors</h1>
            ${M}<emu-grammar>Foo : \`a\`</emu-grammar>
            <emu-grammar>Foo : \`a\`</emu-grammar>
          </emu-clause>
          `,
        {
          ruleId: 'early-error-shape',
          nodeType: 'emu-grammar',
          message:
            'unrecognized structure for early errors: multiple consecutive <emu-grammar>s without intervening <ul> of errors',
        },
      );
    });

    it('missing everything', async () => {
      await assertLint(
        positioned`
          <emu-grammar type="definition">
            Foo : \`a\`
          </emu-grammar>
          ${M}<emu-clause id="example">
            <h1>Static Semantics: Early Errors</h1>
          </emu-clause>
          `,
        {
          ruleId: 'early-error-shape',
          nodeType: 'emu-clause',
          message: 'unrecognized structure for early errors: no <emu-grammar>',
        },
      );
    });
  });

  describe('grammar+SDO validity', () => {
    it('undefined nonterminals in SDOs', async () => {
      await assertLint(
        positioned`
          <emu-grammar>
            ${M}Statement: EmptyStatement
          </emu-grammar>
          <emu-alg>
            1. Return Foo.
          </emu-alg>
        `,
        {
          ruleId: 'undefined-nonterminal',
          nodeType: 'emu-grammar',
          message: 'Could not find a definition for LHS in syntax-directed operation',
        },
      );
    });

    it('error in inline grammar', async () => {
      await assertLint(
        positioned`
          <emu-grammar>${M}Statement: EmptyStatement</emu-grammar>
          <emu-alg>
            1. Return Foo.
          </emu-alg>
        `,
        {
          ruleId: 'undefined-nonterminal',
          nodeType: 'emu-grammar',
          message: 'Could not find a definition for LHS in syntax-directed operation',
        },
      );
    });

    it('undefined productions in SDOs', async () => {
      await assertLint(
        positioned`
          <emu-grammar type="definition">
              Statement: \`;\`
          </emu-grammar>

          <p>SS: Foo</p>
          <emu-grammar>
            Statement: ${M}EmptyStatement
          </emu-grammar>
          <emu-alg>
            1. Return Foo.
          </emu-alg>
        `,
        {
          ruleId: 'undefined-nonterminal',
          nodeType: 'emu-grammar',
          message: 'Could not find a production matching RHS in syntax-directed operation',
        },
      );
    });

    it('negative: productions defined in biblio', async () => {
      let upstream = await getBiblio(`
        <emu-grammar type="definition">
          Statement: EmptyStatement
        </emu-grammar>
      `);

      await assertLintFree(
        `
          <emu-grammar>
            Statement: EmptyStatement
          </emu-grammar>
          <emu-alg>
            1. Return Foo.
          </emu-alg>
        `,
        {
          extraBiblios: [upstream],
        },
      );
    });
  });

  describe('header format', () => {
    it('name format', async () => {
      await assertLint(
        positioned`
          <emu-clause id="foo">
            <h1>${M}something: ( )</h1>
          </emu-clause>
        `,
        {
          ruleId: 'header-format',
          nodeType: 'h1',
          message:
            "expected operation to have a name like 'Example', 'Runtime Semantics: Foo', 'Example.prop', etc, but found \"something: \"",
        },
      );
      await assertLint(
        positioned`
          <emu-clause id="foo">
            <h1>${M}Example [ @@baz ] ( )</h1>
          </emu-clause>
        `,
        {
          ruleId: 'header-format',
          nodeType: 'h1',
          message:
            'found use of unsupported legacy well-known Symbol notation @@baz; use %Symbol.baz% instead',
        },
      );
    });

    it('spacing', async () => {
      await assertLint(
        positioned`
          <emu-clause id="foo">
            <h1>Exampl${M}e( )</h1>
          </emu-clause>
        `,
        {
          ruleId: 'header-format',
          nodeType: 'h1',
          message: 'expected header to have a single space before the argument list',
        },
      );
    });

    it('arg format', async () => {
      await assertLint(
        positioned`
          <emu-clause id="foo">
            <h1>Example ${M}(_a_)</h1>
          </emu-clause>
        `,
        {
          ruleId: 'header-format',
          nodeType: 'h1',
          message:
            "expected parameter list to look like '( _a_ [ , _b_ ] )', '( _foo_, _bar_, ..._baz_ )', '( _foo_, … , _bar_ )', or '( . . . )'",
        },
      );
      await assertLint(
        positioned`
          <emu-clause id="foo">
            <h1>Example ${M}( _a_ [ , <del>_b_</del> ] )</h1>
          </emu-clause>
        `,
        {
          ruleId: 'header-format',
          nodeType: 'h1',
          message:
            "expected parameter list to look like '( _a_ [ , _b_ ] )', '( _foo_, _bar_, ..._baz_ )', '( _foo_, … , _bar_ )', or '( . . . )'",
        },
      );
    });

    it('legal names', async () => {
      await assertLintFree(`
          <emu-clause id="i1">
            <h1>Example ( )</h1>
          </emu-clause>
          <emu-clause id="i2">
            <h1>Runtime Semantics: Example ( )</h1>
          </emu-clause>
          <emu-clause id="i3">
            <h1>The * Operator ( \`*\` )</h1>
          </emu-clause>
          <emu-clause id="i4">
            <h1>Number::example ( )</h1>
          </emu-clause>
          <emu-clause id="i5">
            <h1>[[Example]] ( )</h1>
          </emu-clause>
          <emu-clause id="i6">
            <h1>_Example_ ( )</h1>
          </emu-clause>
          <emu-clause id="i7">
            <h1>%Foo%.bar [ %Symbol.iterator% ] ( )</h1>
          </emu-clause>
          <emu-clause id="i8">
            <h1>ForIn/OfHeadEvaluation ( )</h1>
          </emu-clause>
          <emu-clause id="i9">
            <h1>Object.prototype.__defineGetter__ ( )</h1>
          </emu-clause>
          <emu-clause id="i10">
            <h1>_NativeError_ [ %baz% ] ( )</h1>
          </emu-clause>
      `);
    });

    it('legal argument lists', async () => {
      await assertLintFree(`
          <emu-clause id="i1">
            <h1>Example ( )</h1>
          </emu-clause>
          <emu-clause id="i2">
            <h1>Example ( _foo_ )</h1>
          </emu-clause>
          <emu-clause id="i3">
            <h1>Example ( [ _foo_ ] )</h1>
          </emu-clause>
          <emu-clause id="i4">
            <h1>Date ( _year_, _month_ [ , _date_ [ , _hours_ [ , _minutes_ [ , _seconds_ [ , _ms_ ] ] ] ] ] )</h1>
          </emu-clause>
          <emu-clause id="i5">
            <h1>Object ( . . . )</h1>
          </emu-clause>
          <emu-clause id="i6">
            <h1>String.raw ( _template_, ..._substitutions_ )</h1>
          </emu-clause>
          <emu-clause id="i7">
            <h1>Function ( _p1_, _p2_, &hellip; , _pn_, _body_ )</h1>
          </emu-clause>
          <emu-clause id="i7-a">
            <h1>Function ( ..._parameterArgs_, _bodyArg_ )</h1>
          </emu-clause>
          <emu-clause id="i8">
            <h1>Example ( _a_, <del>_b_</del><ins>_c_</ins> )</h1>
          </emu-clause>
          <emu-clause id="i9">
            <h1>Example ( _a_<ins> [ , _b_ ]</ins> )</h1>
          </emu-clause>
          <emu-clause id="i10">
            <h1>Example ( _a_ <del>[ , _b_ ] </del>)</h1>
          </emu-clause>
          <emu-clause id="i11" type="abstract operation">
            <h1>Example ( ): a thing (which has a parenthetical)</h1>
            <dl class="header">
            </dl>
          </emu-clause>
      `);
    });
  });

  describe('closing tags', () => {
    it('grammar', async () => {
      await assertLint(
        positioned`
          ${M}<emu-grammar type="definition">
            Statement: \`;\`
          <!--</emu-grammar>-->
        `,
        {
          ruleId: 'missing-closing-tag',
          nodeType: 'emu-grammar',
          message: 'element <emu-grammar> is missing its closing tag',
        },
      );
    });

    it('algorithm', async () => {
      await assertLint(
        positioned`
          ${M}<emu-alg>
            1. Foo.
          <!--</emu-alg>-->
        `,
        {
          ruleId: 'missing-closing-tag',
          nodeType: 'emu-alg',
          message: 'element <emu-alg> is missing its closing tag',
        },
      );
    });
  });

  describe('nonterminal definedness', () => {
    it('in LHS', async () => {
      await assertLint(
        positioned`
          <emu-grammar>
            ${M}Example: \`;\`
          </emu-grammar>
        `,
        {
          ruleId: 'undefined-nonterminal',
          nodeType: 'emu-grammar',
          message: 'could not find a definition for nonterminal Example',
        },
      );
    });

    it('in RHS', async () => {
      await assertLint(
        positioned`
          <emu-grammar type="definition">
            Example: \`;\`
          </emu-grammar>
          <emu-grammar>
            Example: ${M}Undefined
          </emu-grammar>
        `,
        {
          ruleId: 'undefined-nonterminal',
          nodeType: 'emu-grammar',
          message: 'could not find a definition for nonterminal Undefined',
        },
      );
    });

    it('in algorithm', async () => {
      await assertLint(
        positioned`
          <emu-alg>
            1. Let _s_ be |${M}Example|.
            1. Return _s_.
          </emu-alg>
        `,
        {
          ruleId: 'undefined-nonterminal',
          nodeType: 'emu-alg',
          message: 'could not find a definition for nonterminal Example',
        },
      );
    });

    it('in SDO', async () => {
      await assertLint(
        positioned`
          <emu-grammar type="definition">
            Statement: \`;\`
          </emu-grammar>
          <emu-clause id="example">
            <h1>Something</h1>
            <emu-grammar>Statement: \`;\`</emu-grammar>
            <emu-alg>
              1. Let _s_ be |${M}Statements|.
              1. Return _s_.
            </emu-alg>
          </emu-clause>
        `,
        {
          ruleId: 'undefined-nonterminal',
          nodeType: 'emu-alg',
          message: 'could not find a definition for nonterminal Statements',
        },
      );
    });

    it('in prose', async () => {
      await assertLint(
        positioned`
          <p>Discuss: |${M}Example|.</p>
        `,
        {
          ruleId: 'undefined-nonterminal',
          nodeType: 'text',
          message: 'could not find a definition for nonterminal Example',
        },
      );
    });

    it('in literal emu-nt', async () => {
      await assertLint(
        positioned`
          <p>Discuss: <emu-nt>${M}Example</emu-nt>.</p>
        `,
        {
          ruleId: 'undefined-nonterminal',
          nodeType: 'emu-nt',
          message: 'could not find a definition for nonterminal Example',
        },
      );
    });

    it('negative', async () => {
      await assertLintFree(`
        <emu-grammar type="definition">
          Example1: \`;\`
          Example2: Example1
        </emu-grammar>
        <emu-grammar>
          Example1: \`;\`
        </emu-grammar>
        <emu-grammar>
          Example2: Example1
        </emu-grammar>
        <emu-alg>
          1. Let _s_ be |Example1|.
          1. Return _s_.
        </emu-alg>
        <p>Discuss: |Example1|.</p>
        <p>Discuss: <emu-nt>Example1</emu-nt>.</p>
      `);
    });
  });

  describe('duplicate definitions', () => {
    it('within dfns', async () => {
      await assertLint(
        positioned`
          <emu-clause id="sec-example">
            <h1>Example</h1>
            ${M}<dfn variants="Foo">Foo</dfn>
          </emu-clause>
        `,
        {
          ruleId: 'duplicate-definition',
          nodeType: 'dfn',
          message: '"Foo" is defined more than once in this definition',
        },
      );

      await assertLint(
        positioned`
          <emu-clause id="sec-example">
            <h1>Example</h1>
            ${M}<dfn variants="Foo,Foo">Bar</dfn>
          </emu-clause>
        `,
        {
          ruleId: 'duplicate-definition',
          nodeType: 'dfn',
          message: '"Foo" is defined more than once in this definition',
        },
      );
    });

    it('across dfns', async () => {
      await assertLint(
        positioned`
          <emu-clause id="sec-example">
            <h1>Example</h1>
            <dfn>Foo</dfn>
            ${M}<dfn>Foo</dfn>
          </emu-clause>
        `,
        {
          ruleId: 'duplicate-definition',
          nodeType: 'dfn',
          message: 'duplicate definition "Foo"',
        },
      );

      await assertLint(
        positioned`
          <emu-clause id="sec-example">
            <h1>Example</h1>
            <dfn>Foo</dfn>
            ${M}<dfn variants="Foo">Bar</dfn>
          </emu-clause>
        `,
        {
          ruleId: 'duplicate-definition',
          nodeType: 'dfn',
          message: 'duplicate definition "Foo"',
        },
      );

      await assertLint(
        positioned`
          <emu-clause id="sec-example">
            <h1>Example</h1>
            <dfn variants="Foo">Bar</dfn>
            ${M}<dfn>Foo</dfn>
          </emu-clause>
        `,
        {
          ruleId: 'duplicate-definition',
          nodeType: 'dfn',
          message: 'duplicate definition "Foo"',
        },
      );

      await assertLint(
        positioned`
          <emu-clause id="sec-example">
            <h1>Example</h1>
            <dfn variants="Foo">Bar</dfn>
            ${M}<dfn variants="Foo">Baz</dfn>
          </emu-clause>
        `,
        {
          ruleId: 'duplicate-definition',
          nodeType: 'dfn',
          message: 'duplicate definition "Foo"',
        },
      );
    });

    it('for clauses', async () => {
      await assertLint(
        positioned`
          <emu-clause id="sec-example">
            <h1>Example</h1>
            <dfn>Foo</dfn>
            ${M}<emu-clause id="sec-exampleao" aoid="Foo">
              <h1>Foo ( _param_ )</h1>
            </emu-clause>
          </emu-clause>
        `,
        {
          ruleId: 'duplicate-definition',
          nodeType: 'emu-clause',
          message: 'duplicate definition "Foo"',
        },
      );

      await assertLint(
        positioned`
          <emu-clause id="sec-example">
            <h1>Example</h1>
            <dfn>Foo</dfn>
            ${M}<emu-clause id="sec-exampleao" type="abstract operation">
              <h1>
                Foo (
                  param : an integer,
                )
              </h1>
              <dl class='header'>
              </dl>
            </emu-clause>
          </emu-clause>
        `,
        {
          ruleId: 'duplicate-definition',
          nodeType: 'emu-clause',
          message: 'duplicate definition "Foo"',
        },
      );
    });

    it('for eqns', async () => {
      await assertLint(
        positioned`
        <emu-clause id="sec-example">
          <h1>Example</h1>
          <dfn>Foo</dfn>
          <p>The mathematical function <emu-eqn id="eqn-abs" aoid="${M}Foo" class="inline">Foo(<var>x</var>)</emu-eqn> is an example.</p>
          </emu-clause>
      `,
        {
          ruleId: 'duplicate-definition',
          nodeType: 'emu-eqn',
          message: 'duplicate definition "Foo"',
        },
      );
    });

    it('is present when using structured headers without explict AOIDs', async () => {
      await assertLint(
        positioned`
          <emu-clause id="sec-example" type="abstract operation">
            <h1>Foo ( _param_ )</h1>
            <dl class='header'>
              <dt>description</dt>
              <dd>It is an example.</dd>
            </dl>
          </emu-clause>

          ${M}<emu-clause id="sec-example-redef" type="abstract operation">
            <h1>Foo ( _param_ )</h1>
            <dl class='header'>
              <dt>description</dt>
              <dd>It redefines an existing algorithm.</dd>
            </dl>
          </emu-clause>
          `,
        {
          ruleId: 'duplicate-definition',
          nodeType: 'emu-clause',
          message: 'duplicate definition "Foo"',
        },
      );
    });

    it('is suppressed when using `redefinition: true`', async () => {
      await assertLintFree(`
        <emu-clause id="sec-example" type="abstract operation">
          <h1>Foo ( _param_ )</h1>
          <dl class='header'>
            <dt>description</dt>
            <dd>It is an example.</dd>
          </dl>
        </emu-clause>

        <emu-clause id="sec-example-redef" type="abstract operation">
          <h1>Foo ( _param_ )</h1>
          <dl class='header'>
            <dt>description</dt>
            <dd>It redefines an existing algorithm.</dd>
            <dt>redefinition</dt>
            <dd>true</dd>
          </dl>
        </emu-clause>
      `);
    });
  });

  describe('emu-table abstract methods', () => {
    it('missing table', async () => {
      await assertLint(
        positioned`
          ${M}<emu-table type="abstract methods" of="Something">
            <caption>Abstract Methods</caption>
          </emu-table>
        `,
        {
          ruleId: 'emu-table-missing',
          nodeType: 'emu-table',
          message: '<emu-table type="abstract methods"> must contain a <table> element',
        },
      );
    });

    it('missing of', async () => {
      await assertLint(
        positioned`
          ${M}<emu-table type="abstract methods">
            <table></table>
          </emu-table>
        `,
        {
          ruleId: 'emu-abstract-methods-invalid',
          nodeType: 'emu-table',
          message: '<emu-table type="abstract methods"> must have an \'of\' attribute',
        },
      );
    });

    it('missing description td', async () => {
      await assertLint(
        positioned`
          <emu-table type="abstract methods" of="Something">
            <table>
              ${M}<tr><td><h1>Foo ( ): ~unused~</h1></td></tr>
            </table>
          </emu-table>
        `,
        {
          ruleId: 'emu-abstract-methods-invalid',
          nodeType: 'tr',
          message: '<emu-table type="abstract methods"> <tr>s must contain at least two <td>s',
        },
      );
    });
  });

  it('concrete method without corresponding abstract method', async () => {
    await assertLint(
      positioned`
        <emu-clause id="sec-test" type="concrete method">
        ${M}<h1>Example ( )</h1>
        <dl class='header'>
          <dt>for</dt>
          <dd>a Something _foo_</dd>
          </dl>
        </emu-clause>
      `,
      {
        ruleId: 'concrete-method-base',
        nodeType: 'h1',
        message: 'could not find an abstract method corresponding to concrete method Example',
      },
    );
  });
});
