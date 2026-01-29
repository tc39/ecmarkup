import assert from 'assert';
import type { EcmarkupError, Options } from '../lib/ecmarkup.js';
import * as emu from '../lib/ecmarkup.js';
import type { ExportedBiblio } from '../lib/Biblio.js';

type Position = { offset: number; line: number; column: number };
type PositionedResult = Position & { html: string };
type MultiPositionedResult = { positions: Position[]; html: string };
type ErrorDescriptor = {
  ruleId: string;
  nodeType: string;
  message: string;
  line?: number;
  column?: number;
};
type PositionedInput = string | PositionedResult | MultiPositionedResult;

const lintLocationMarker = {};

function positioned(
  literalParts: TemplateStringsArray,
  ...interpolatedParts: unknown[]
): PositionedResult {
  const markerIndex = interpolatedParts.indexOf(lintLocationMarker);
  if (markerIndex < 0 || markerIndex !== interpolatedParts.lastIndexOf(lintLocationMarker)) {
    throw new Error('positioned template tag must interpolate the location marker exactly once');
  }
  const multi = multipositioned(literalParts, ...interpolatedParts);
  return { ...multi.positions[0], html: multi.html };
}

function multipositioned(
  literalParts: TemplateStringsArray,
  ...interpolatedParts: unknown[]
): MultiPositionedResult {
  const markerIndexes = interpolatedParts
    .map((value, index) => ({ value, index }))
    .filter(({ value }) => value === lintLocationMarker)
    .map(({ index }) => index);
  if (markerIndexes.length === 0) {
    throw new Error(
      'multipositioned template tag must interpolate the location marker at least once',
    );
  }
  const positions = [];

  let str = literalParts[0];
  for (let i = 0; i < literalParts.length - 1; ++i) {
    if (markerIndexes.includes(i)) {
      const offset = str.length;
      const lines = str.split('\n');
      const line = lines.length;
      const column = lines[lines.length - 1].length + 1;
      positions.push({ offset, line, column });
    } else {
      str += String(interpolatedParts[i]);
    }
    str += literalParts[i + 1];
  }
  return { positions, html: str };
}

async function assertError(
  obj: PositionedInput,
  errorOrErrors: ErrorDescriptor | ErrorDescriptor[],
  opts: Options & { asImport?: boolean | 'only' } = {},
) {
  let html: string;
  let errors: ErrorDescriptor[];
  if (Array.isArray(errorOrErrors)) {
    if (typeof obj === 'string') {
      html = obj;
      errors = errorOrErrors;
      // no line and column for any error
    } else if (!('positions' in obj)) {
      if (errorOrErrors.length !== 1) {
        throw new Error(
          `your source has positions for 1 error but your assertion passes ${errorOrErrors.length}`,
        );
      }
      // kind of weird to pass an array of length 1 here but it might come up when copying tests, no reason to disallow
      ({ html } = obj);
      errors = [{ ...errorOrErrors[0], line: obj.line, column: obj.column }];
    } else {
      if (errorOrErrors.length !== obj.positions.length) {
        throw new Error(
          `your source has positions for ${obj.positions.length} error(s) but your assertion passes ${errorOrErrors.length}`,
        );
      }
      ({ html } = obj);
      errors = errorOrErrors.map((e, i) => ({ ...e, ...obj.positions[i] }));
    }
  } else {
    let line: number | undefined, column: number | undefined;
    if (typeof obj === 'string') {
      html = obj;
    } else if ('positions' in obj) {
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
    errors = [{ ...errorOrErrors, line, column }];
  }
  let warnings: EcmarkupError[] = [];

  const rootFile = 'test-example.emu';
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
      errors.map(({ ruleId, nodeType, line, column, message }) => ({
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

  const importWrapper = `<emu-import href="./import.emu"></emu-import>`;
  const fetch = async (name: string) => (name === rootFile ? importWrapper : html);
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
    errors.map(({ ruleId, nodeType, line, column, message }) => ({
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

async function assertErrorFree(html: string, opts: Options = {}) {
  if (typeof html !== 'string') {
    throw new Error(
      "assertErrorFree expects a string; did you forget to remove the 'positioned' tag?",
    );
  }
  const warnings: EcmarkupError[] = [];

  await emu.build('test-example.emu', async () => html, {
    copyright: false,
    assets: 'none',
    warn: e => warnings.push(e),
    ...opts,
  });

  assert.deepStrictEqual(warnings, []);
}

async function assertLint(
  a: PositionedInput,
  b: ErrorDescriptor | ErrorDescriptor[],
  opts: Options = {},
) {
  await assertError(a, b, { lintSpec: true, ...opts });
}

async function assertLintFree(html: string, opts: Options = {}) {
  await assertErrorFree(html, { lintSpec: true, ...opts });
}

async function getBiblio(html: string): Promise<ExportedBiblio> {
  const upstream = await emu.build('root.html', async () => html, {
    assets: 'none',
    location: 'https://example.com/spec/',
  });
  return upstream.exportBiblio()!;
}

export {
  lintLocationMarker,
  positioned,
  multipositioned,
  assertError,
  assertErrorFree,
  assertLint,
  assertLintFree,
  getBiblio,
};
