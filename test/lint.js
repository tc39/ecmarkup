'use strict';

let { assertLint, assertLintFree, positioned, lintLocationMarker: M } = require('./utils.js');

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
          message: "Parameter 'a' is unused.",
        }
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
          message: "There is no argument given for parameter 'a'.",
        }
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
          message: "Parameter 'a' is unused.",
        }
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
        }
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
        }
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
        }
      );
    });
  });

  describe('header format', () => {
    it('name format', async () => {
      await assertLint(
        positioned`
          <emu-clause id="foo">
            <h1>${M}something: ( )</h1>
        `,
        {
          ruleId: 'header-format',
          nodeType: 'h1',
          message:
            "expected operation to have a name like 'Example', 'Runtime Semantics: Foo', 'Example.prop', etc, but found \"something: \"",
        }
      );
    });

    it('spacing', async () => {
      await assertLint(
        positioned`
          <emu-clause id="foo">
            <h1>Exampl${M}e( )</h1>
        `,
        {
          ruleId: 'header-format',
          nodeType: 'h1',
          message: 'expected header to have a single space before the argument list',
        }
      );
    });

    it('arg format', async () => {
      await assertLint(
        positioned`
          <emu-clause id="foo">
            <h1>Example ${M}(_a_)</h1>
        `,
        {
          ruleId: 'header-format',
          nodeType: 'h1',
          message:
            "expected parameter list to look like '( _a_ [ , _b_ ] )', '( _foo_, _bar_, ..._baz_ )', '( _foo_, … , _bar_ )', or '( . . . )'",
        }
      );
      await assertLint(
        positioned`
          <emu-clause id="foo">
            <h1>Example ${M}( _a_ [ , <del>_b_</del> ] )</h1>
        `,
        {
          ruleId: 'header-format',
          nodeType: 'h1',
          message:
            "expected parameter list to look like '( _a_ [ , _b_ ] )', '( _foo_, _bar_, ..._baz_ )', '( _foo_, … , _bar_ )', or '( . . . )'",
        }
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
            <h1>%Foo%.bar [ @@iterator ] ( )</h1>
          </emu-clause>
          <emu-clause id="i8">
            <h1>ForIn/OfHeadEvaluation ( )</h1>
          </emu-clause>
          <emu-clause id="i9">
            <h1>Object.prototype.__defineGetter__ ( )</h1>
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
          <emu-clause id="i8">
            <h1>Example ( _a_, <del>_b_</del><ins>_c_</ins> )</h1>
          </emu-clause>
          <emu-clause id="i9">
            <h1>Example ( _a_<ins> [ , _b_ ]</ins> )</h1>
          </emu-clause>
          <emu-clause id="i10">
            <h1>Example ( _a_ <del>[ , _b_ ] </del>)</h1>
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
          ruleId: 'missing-close-tag',
          nodeType: 'emu-grammar',
          message: 'could not find closing tag for emu-grammar',
        }
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
          ruleId: 'missing-close-tag',
          nodeType: 'emu-alg',
          message: 'could not find closing tag for emu-alg',
        }
      );
    });
  });
});
