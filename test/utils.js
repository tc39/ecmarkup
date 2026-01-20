'use strict';

let assert = require('assert');
let emu = require('../lib/ecmarkup');

let lintLocationMarker = {};

function positioned(literalParts, ...interpolatedParts) {
  let markerIndex = interpolatedParts.indexOf(lintLocationMarker);
  if (markerIndex < 0 || markerIndex !== interpolatedParts.lastIndexOf(lintLocationMarker)) {
    throw new Error('positioned template tag must interpolate the location marker exactly once');
  }
  let multi = multipositioned(literalParts, ...interpolatedParts);
  return { ...multi.positions[0], html: multi.html };
}

function multipositioned(literalParts, ...interpolatedParts) {
  let markerIndexes = interpolatedParts
    .map((value, index) => ({ value, index }))
    .filter(({ value }) => value === lintLocationMarker)
    .map(({ index }) => index);
  if (markerIndexes === 0) {
    throw new Error(
      'multipositioned template tag must interpolate the location marker at least once',
    );
  }
  let positions = [];

  let str = literalParts[0];
  for (let i = 0; i < literalParts.length - 1; ++i) {
    if (markerIndexes.includes(i)) {
      let offset = str.length;
      let lines = str.split('\n');
      let line = lines.length;
      let column = lines[lines.length - 1].length + 1;
      positions.push({ offset, line, column });
    } else {
      str += String(interpolatedParts[i]);
    }
    str += literalParts[i + 1];
  }
  return { positions, html: str };
}

async function assertError(obj, errorOrErrors, opts) {
  let html;
  if (Array.isArray(errorOrErrors)) {
    if (typeof obj === 'string') {
      html = obj;
      // no line and column for any error
    } else if (!obj.positions) {
      if (errorOrErrors.length !== 1) {
        throw new Error(
          `your source has positions for 1 error but your assertion passes ${errorOrErrors.length}`,
        );
      }
      // kind of weird to pass an array of length 1 here but it might come up when copying tests, no reason to disallow
      ({ html } = obj);
      errorOrErrors = [{ ...errorOrErrors[0], line: obj.line, column: obj.column }];
    } else {
      if (errorOrErrors.length !== obj.positions.length) {
        throw new Error(
          `your source has positions for ${obj.positions.length} error(s) but your assertion passes ${errorOrErrors.length}`,
        );
      }
      ({ html } = obj);
      errorOrErrors = errorOrErrors.map((e, i) => ({ ...e, ...obj.positions[i] }));
    }
  } else {
    let line, column;
    if (typeof obj === 'string') {
      html = obj;
    } else if (obj.positions) {
      if (obj.positions.length !== 1) {
        throw new Error(
          `your source has positions for ${obj.positions.length} errors but your assertion only passes 1`,
        );
      }
      // kind of weird to use multipositioned for a single error but it might come up when copying tests, no reason to disallow
      ({ line, column } = obj.positions[0]);
      ({ html } = obj);
    } else {
      ({ line, column, html } = obj);
    }
    errorOrErrors = [{ ...errorOrErrors, line, column }];
  }
  let warnings = [];

  let rootFile = 'test-example.emu';
  if (opts?.asImport !== 'only') {
    await emu.build(rootFile, async () => html, {
      copyright: false,
      assets: 'none',
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
      errorOrErrors.map(({ ruleId, nodeType, line, column, message }) => ({
        ruleId,
        nodeType,
        line,
        column,
        message,
        file: undefined,
        source: line == null ? undefined : html,
      })),
    );
  }

  if (opts?.asImport === false) {
    return;
  }

  // because location information is complicated in imports, do it again in an emu-import
  warnings = [];

  let importWrapper = `<emu-import href="./import.emu"></emu-import>`;
  let fetch = name => (name === rootFile ? importWrapper : html);
  await emu.build(rootFile, fetch, {
    copyright: false,
    assets: 'none',
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
    errorOrErrors.map(({ ruleId, nodeType, line, column, message }) => ({
      ruleId,
      nodeType,
      line,
      column,
      message,
      file: line == null ? undefined : 'import.emu',
      source: line == null ? undefined : html,
    })),
    'error information inside of import',
  );
}

async function assertErrorFree(html, opts) {
  if (typeof html !== 'string') {
    throw new Error(
      "assertErrorFree expects a string; did you forget to remove the 'positioned' tag?",
    );
  }
  let warnings = [];

  await emu.build('test-example.emu', async () => html, {
    copyright: false,
    assets: 'none',
    warn: e => warnings.push(e),
    ...opts,
  });

  assert.deepStrictEqual(warnings, []);
}

async function assertLint(a, b, opts = {}) {
  await assertError(a, b, { lintSpec: true, ...opts });
}

async function assertLintFree(html, opts = {}) {
  await assertErrorFree(html, { lintSpec: true, ...opts });
}

async function getBiblio(html) {
  let upstream = await emu.build('root.html', () => html, {
    assets: 'none',
    location: 'https://example.com/spec/',
  });
  return upstream.exportBiblio();
}

module.exports = {
  lintLocationMarker,
  positioned,
  multipositioned,
  assertError,
  assertErrorFree,
  assertLint,
  assertLintFree,
  getBiblio,
};
