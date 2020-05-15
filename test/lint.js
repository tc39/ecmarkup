'use strict';

let assert = require('assert');
let emu = require('../lib/ecmarkup');

function alg([before, after], marker) {
  return `<emu-alg>${before}${marker}${after}</emu-alg>`;
}

let M = '@@@'; // Marks the location of the error

describe.only('linting', function () {
  describe('grammar sanity', function () {
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

  describe('grammar+SDO sanity', function () {
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
        'expected line to end with "." (found "testing")'
      );
    });

    it('inline', async function () {
      await assertLint(alg`1. ${M}testing`, 'expected line to end with "." (found "testing")');
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
  });
});

async function assertLint(src, message) {
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

  let reported = false;
  function reportLintErrors(errors) {
    reported = true;
    assert.equal(errors.length, 1, 'should have exactly one error');
    assert.deepStrictEqual(errors[0], {
      line,
      column,
      message,
    });
  }
  await emu.build('test-example.emu', async () => src, {
    ecma262Biblio: false,
    copyright: false,
    reportLintErrors,
  });
  assert(reported);
}
