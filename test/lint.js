'use strict';

let { assertLint, assertLintFree, positioned, lintLocationMarker: M } = require('./lint-helpers');

describe('linting whole program', function () {
  describe('grammar validity', function () {
    it('unused parameters', async function () {
      await assertLint(
        positioned`
          <emu-grammar type="definition">
            Statement[${M}a]: \`;\`
          </emu-grammar>
        `,
        {
          ruleId: 'grammarkdown:2008',
          nodeType: '«Parameter»',
          message: "Parameter 'a' is unused.",
        }
      );
    });

    it('missing parameters', async function () {
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
          nodeType: '«identifier»',
          message: "There is no argument given for parameter 'a'.",
        }
      );
    });

    it('error in inline grammar', async function () {
      await assertLint(
        positioned`
          <emu-grammar type="definition"> Statement[${M}a]: \`;\` </emu-grammar>
        `,
        {
          ruleId: 'grammarkdown:2008',
          nodeType: '«Parameter»',
          message: "Parameter 'a' is unused.",
        }
      );
    });
  });

  describe('grammar+SDO validity', function () {
    it('undefined nonterminals in SDOs', async function () {
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
          nodeType: 'EMU-GRAMMAR',
          message: 'Could not find a definition for LHS in syntax-directed operation',
        }
      );
    });

    it('error in inline grammar', async function () {
      await assertLint(
        positioned`
          <emu-grammar> ${M}Statement: EmptyStatement </emu-grammar>
          <emu-alg>
            1. Return Foo.
          </emu-alg>
        `,
        {
          ruleId: 'undefined-nonterminal',
          nodeType: 'EMU-GRAMMAR',
          message: 'Could not find a definition for LHS in syntax-directed operation',
        }
      );
    });

    it('undefined productions in SDOs', async function () {
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
          nodeType: 'EMU-GRAMMAR',
          message: 'Could not find a production matching RHS in syntax-directed operation',
        }
      );
    });
  });

  describe('header format', function () {
    it('name format', async function () {
      await assertLint(
        positioned`
          <emu-clause id="foo">
            <h1>${M}something: ( )</h1>
        `,
        {
          ruleId: 'header-format',
          nodeType: 'H1',
          message:
            "expected operation to have a name like 'Example', 'Runtime Semantics: Foo', 'Example.prop', etc, but found \"something: \"",
        }
      );
    });

    it('spacing', async function () {
      await assertLint(
        positioned`
          <emu-clause id="foo">
            <h1>Exampl${M}e( )</h1>
        `,
        {
          ruleId: 'header-format',
          nodeType: 'H1',
          message: 'expected header to have a single space before the argument list',
        }
      );

      await assertLint(
        positioned`
          <emu-clause id="foo">
            <h1>Example ${M} ( )</h1>
        `,
        {
          ruleId: 'header-format',
          nodeType: 'H1',
          message: 'expected header to have a single space before the argument list',
        }
      );
    });

    it('arg format', async function () {
      await assertLint(
        positioned`
          <emu-clause id="foo">
            <h1>Example ${M}(_a_)</h1>
        `,
        {
          ruleId: 'header-format',
          nodeType: 'H1',
          message:
            "expected parameter list to look like '( _a_, [ , _b_ ] )', '( _foo_, _bar_, ..._baz_ )', '( _foo_, … , _bar_ )', or '( . . . )'",
        }
      );
    });

    it('legal names', async function () {
      await assertLintFree(`
          <emu-clause id="foo">
            <h1>Example ( )</h1>
          </emu-clause>
          <emu-clause id="foo">
            <h1>Runtime Semantics: Example ( )</h1>
          </emu-clause>
          <emu-clause id="foo">
            <h1>The * Operator ( \`*\` )</h1>
          </emu-clause>
          <emu-clause id="foo">
            <h1>Number::example ( )</h1>
          </emu-clause>
          <emu-clause id="foo">
            <h1>[[Example]] ( )</h1>
          </emu-clause>
          <emu-clause id="foo">
            <h1>_Example_ ( )</h1>
          </emu-clause>
          <emu-clause id="foo">
            <h1>%Foo%.bar [ @@iterator ] ( )</h1>
          </emu-clause>
      `);
    });

    it('legal argument lists', async function () {
      await assertLintFree(`
          <emu-clause id="foo">
            <h1>Example ( )</h1>
          </emu-clause>
          <emu-clause id="foo">
            <h1>Example ( _foo_ )</h1>
          </emu-clause>
          <emu-clause id="foo">
            <h1>Example ( [ _foo_ ] )</h1>
          </emu-clause>
          <emu-clause id="foo">
            <h1>Date ( _year_, _month_ [ , _date_ [ , _hours_ [ , _minutes_ [ , _seconds_ [ , _ms_ ] ] ] ] ] )</h1>
          </emu-clause>
          <emu-clause id="foo">
            <h1>Object ( . . . )</h1>
          </emu-clause>
          <emu-clause id="foo">
            <h1>String.raw ( _template_, ..._substitutions_ )</h1>
          </emu-clause>
          <emu-clause id="foo">
            <h1>Function ( _p1_, _p2_, &hellip; , _pn_, _body_ )</h1>
          </emu-clause>
      `);
    });
  });

  describe('closing tags', function () {
    it('grammar', async function () {
      await assertLint(
        positioned`
          ${M}<emu-grammar type="definition">
            Statement: \`;\`
          <!--</emu-grammar>-->
        `,
        {
          ruleId: 'no-close-tag',
          nodeType: 'EMU-GRAMMAR',
          message: 'could not find closing tag for emu-grammar',
        }
      );
    });

    it('algorithm', async function () {
      await assertLint(
        positioned`
          ${M}<emu-alg>
            1. Foo.
          <!--</emu-alg>-->
        `,
        {
          ruleId: 'no-close-tag',
          nodeType: 'EMU-ALG',
          message: 'could not find closing tag for emu-alg',
        }
      );
    });
  });
});
