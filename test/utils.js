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

async function assertError({ line, column, html }, { ruleId, nodeType, message }, opts) {
  let warnings = [];

  await emu.build('test-example.emu', async () => html, {
    ecma262Biblio: false,
    copyright: false,
    warn: e =>
      warnings.push({
        ruleId: e.ruleId,
        nodeType: e.nodeType,
        line: e.line,
        column: e.column,
        message: e.message,
      }),
    ...opts,
  });

  assert.deepStrictEqual(warnings, [
    {
      ruleId,
      nodeType,
      line,
      column,
      message,
    },
  ]);
}

async function assertErrorFree(html, opts) {
  let warnings = [];

  await emu.build('test-example.emu', async () => html, {
    ecma262Biblio: false,
    copyright: false,
    warn: e => warnings.push(e),
    ...opts,
  });

  assert.deepStrictEqual(warnings, []);
}

async function assertLint(a, b) {
  await assertError(a, b, { lintSpec: true });
}

async function assertLintFree(html) {
  await assertErrorFree(html, { lintSpec: true });
}

module.exports = {
  lintLocationMarker,
  positioned,
  assertError,
  assertErrorFree,
  assertLint,
  assertLintFree,
};
