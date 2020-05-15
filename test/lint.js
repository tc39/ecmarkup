'use strict';

let assert = require('assert');
let emu = require('../lib/ecmarkup');

function alg([before, after], marker) {
  return `<emu-alg>${before}${marker}${after}</emu-alg>`;
}

let M = '@@@'; // Marks the location of the error

describe('linting', function () {
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

  describe('algorithm line endings', function () {
    it('simple', async function () {
      await assertLint(
        alg`
          1. ${M}testing
        `,
        'expected freeform line to end with "." (found "testing")'
      );
    });

    it('inline', async function () {
      await assertLint(
        alg`1. ${M}testing`,
        'expected freeform line to end with "." (found "testing")'
      );
    });

    it('repeat', async function () {
      await assertLint(
        alg`
          1. ${M}Repeat, while _x_ < 10
            1. Foo.
        `,
        'expected "Repeat" to end with ","'
      );
    });

    it('inline if', async function () {
      await assertLint(
        alg`
          1. ${M}If _x_, then
        `,
        'expected "If" without substeps to end with "." or ":" (found ", then")'
      );
    });

    it('multiline if', async function () {
      await assertLint(
        alg`
          1. ${M}If _x_,
            1. Foo.
        `,
        'expected "If" with substeps to end with ", then" (found ",")'
      );
    });

    it('negative', async function () {
      await assertLint(`
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

async function assertLint(src, message = null) {
  let reportLintErrors;
  if (message === null) {
    reportLintErrors = (errors) => {
      throw new Error('unexpected errors ' + JSON.stringify(errors));
    };
  } else {
    let line, column;
    src.split('\n').forEach((contents, lineNo) => {
      let idx = contents.indexOf(M);
      if (idx !== -1) {
        line = lineNo + 1;
        column = idx + 1;
      }
    });
    let offset = src.indexOf(M);
    src = src.substring(0, offset) + src.substring(offset + M.length);
    reportLintErrors = (errors) => {
      reported = true;
      assert.equal(errors.length, 1, 'should have exactly one error');
      assert.deepStrictEqual(errors[0], {
        line,
        column,
        message,
      });
    };
  }

  let reported = false;
  await emu.build('test-example.emu', async () => src, {
    ecma262Biblio: false,
    copyright: false,
    reportLintErrors,
  });
  assert.equal(reported, message !== null);
}
