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

async function assertError(obj, { ruleId, nodeType, message }, opts) {
  let { line, column, html } =
    typeof obj === 'string' ? { line: undefined, column: undefined, html: obj } : obj;
  let warnings = [];

  let rootFile = 'test-example.emu';
  if (opts?.asImport !== 'only') {
    await emu.build(rootFile, async () => html, {
      ecma262Biblio: false,
      copyright: false,
      warn: e =>
        warnings.push({
          ruleId: e.ruleId,
          nodeType: e.nodeType,
          line: e.line,
          column: e.column,
          message: e.message,
          file: e.file,
          source: e.source,
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
        file: undefined,
        source: line == null ? undefined : html,
      },
    ]);
  }

  if (opts?.asImport === false) {
    return;
  }

  // because location information is complicated in imports, do it again in an emu-import
  warnings = [];

  let importWrapper = `<emu-import href="./import.emu"></emu-import>`;
  let fetch = name => (name === rootFile ? importWrapper : html);
  await emu.build(rootFile, fetch, {
    ecma262Biblio: false,
    copyright: false,
    warn: e =>
      warnings.push({
        ruleId: e.ruleId,
        nodeType: e.nodeType,
        line: e.line,
        column: e.column,
        message: e.message,
        file: e.file,
        source: e.source,
      }),
    ...opts,
  });

  assert.deepStrictEqual(
    warnings,
    [
      {
        ruleId,
        nodeType,
        line,
        column,
        message,
        file: line == null ? undefined : 'import.emu',
        source: line == null ? undefined : html,
      },
    ],
    'error information inside of import'
  );
}

async function assertErrorFree(html, opts) {
  if (typeof html !== 'string') {
    throw new Error(
      "assertErrorFree expects a string; did you forget to remove the 'positioned' tag?"
    );
  }
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

async function assertLintFree(html, opts = {}) {
  await assertErrorFree(html, { lintSpec: true, ...opts });
}

async function getBiblio(html) {
  let upstream = await emu.build('root.html', () => html, {
    location: 'https://example.com/spec/',
  });
  return upstream.exportBiblio();
}

module.exports = {
  lintLocationMarker,
  positioned,
  assertError,
  assertErrorFree,
  assertLint,
  assertLintFree,
  getBiblio,
};
