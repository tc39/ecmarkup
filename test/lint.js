'use strict';

let { assertLint, lintLocationMarker: M } = require('./lint-helpers');

describe('linting whole program', function () {
  describe('grammar validity', function () {
    it('unused parameters', async function () {
      await assertLint(
        `
          <emu-grammar type="definition">
            Statement[${M}a]: \`;\`
          </emu-grammar>
        `,
        "Parameter 'a' is unused."
      );
    });

    it('missing parameters', async function () {
      await assertLint(
        `
          <emu-grammar type="definition">
            Foo[a]:
              [+a] \`a\`
              \`b\`

            Bar: ${M}Foo
          </emu-grammar>
        `,
        "There is no argument given for parameter 'a'."
      );
    });

    it('error in inline grammar', async function () {
      await assertLint(
        `
          <emu-grammar type="definition"> Statement[${M}a]: \`;\` </emu-grammar>
        `,
        "Parameter 'a' is unused."
      );
    });
  });

  describe('grammar+SDO validity', function () {
    it('undefined nonterminals in SDOs', async function () {
      await assertLint(
        `
          <emu-grammar>
            ${M}Statement: EmptyStatement
          </emu-grammar>
          <emu-alg>
            1. Return Foo.
          </emu-alg>
        `,
        'Could not find a definition for LHS in syntax-directed operation'
      );
    });

    it('error in inline grammar', async function () {
      await assertLint(
        `
          <emu-grammar> ${M}Statement: EmptyStatement </emu-grammar>
          <emu-alg>
            1. Return Foo.
          </emu-alg>
        `,
        'Could not find a definition for LHS in syntax-directed operation'
      );
    });

    it('undefined productions in SDOs', async function () {
      await assertLint(
        `
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
        'Could not find a production matching RHS in syntax-directed operation'
      );
    });
  });
});
