'use strict';

let assert = require('assert');
let emu = require('../lib/ecmarkup');

let lintLocationMarker = '@@@';

function alg([before, after], marker) {
  return `<emu-alg>${before}${marker}${after}</emu-alg>`;
}

async function assertLint(src, message = null) {
  let reportLintErrors;
  let reported = false;

  if (message === null) {
    reportLintErrors = errors => {
      throw new Error('unexpected errors ' + JSON.stringify(errors));
    };
  } else {
    let line, column;
    src.split('\n').forEach((contents, lineNo) => {
      let idx = contents.indexOf(lintLocationMarker);
      if (idx !== -1) {
        line = lineNo + 1;
        column = idx + 1;
      }
    });
    let offset = src.indexOf(lintLocationMarker);
    src = src.substring(0, offset) + src.substring(offset + lintLocationMarker.length);
    reportLintErrors = errors => {
      reported = true;
      assert.equal(errors.length, 1, 'should have exactly one error');
      assert.deepStrictEqual(errors[0], {
        line,
        column,
        message,
      });
    };
  }

  await emu.build('test-example.emu', async () => src, {
    ecma262Biblio: false,
    copyright: false,
    reportLintErrors,
  });
  assert.equal(reported, message !== null);
}

module.exports = { assertLint, lintLocationMarker, alg };
