'use strict';

let assert = require('assert');
let emu = require('../lib/ecmarkup');

let lintLocationMarker = {};

function positioned(literalParts, ...interpolatedParts) {
  let markerIndex = interpolatedParts.indexOf(lintLocationMarker);
  if (markerIndex < 0 || markerIndex !== interpolatedParts.lastIndexOf(lintLocationMarker)) {
    throw new Error('alg template tag must interpolate the location marker exactly once');
  }
  let offset, line, column;
  let str = literalParts[0];
  for (let i = 0; i < literalParts.length - 1; ++i) {
    if (i === markerIndex) {
      offset = str.length;
      let lines = str.split('\n');
      line = lines.length;
      column = lines[lines.length - 1].length + 1;
    } else {
      str += String(interpolatedParts[i]);
    }
    str += literalParts[i + 1];
  }
  return { offset, line, column, html: str };
}

async function assertLint({ offset, line, column, html }, message = null) {
  let reportLintErrors;
  let reported = false;

  if (message === null) {
    reportLintErrors = errors => {
      throw new Error('unexpected errors ' + JSON.stringify(errors));
    };
  } else {
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

  await emu.build('test-example.emu', async () => html, {
    ecma262Biblio: false,
    copyright: false,
    reportLintErrors,
  });
  assert.equal(reported, message !== null);
}


module.exports = { assertLint, lintLocationMarker, positioned };
