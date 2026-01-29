import assert from 'assert';
import { describe, it } from 'node:test';
import fs from 'fs';
import path from 'path';

import type { EcmarkupError, Options } from '../lib/ecmarkup.js';
import type { ExportedBiblio } from '../lib/Biblio.js';
import * as emu from '../lib/ecmarkup.js';

import ecma262biblio from './ecma262biblio.json' with { type: 'json' };

const SOURCES_DIR = 'test/baselines/sources/';
const LOCAL_DIR = 'test/baselines/generated-local/';
const REFERENCE_DIR = 'test/baselines/generated-reference/';

const files = fs
  .readdirSync(SOURCES_DIR)
  .filter(f => f.endsWith('.html') && !f.endsWith('.bad.html'));

function build(file: string, options: Options) {
  return emu.build(
    file,
    file =>
      new Promise((resolve, reject) =>
        fs.readFile(file, 'utf-8', (err, data) => (err ? reject(err) : resolve(data))),
      ),
    {
      extraBiblios: [ecma262biblio as ExportedBiblio],
      ...options,
    },
  );
}

describe('baselines', () => {
  const rebaseline = !!process.env.npm_config_update_baselines;
  const dirToWriteOnFailure = rebaseline ? REFERENCE_DIR : LOCAL_DIR;
  const optionsSets = [{ lintSpec: false }];
  for (const file of files) {
    const reference = REFERENCE_DIR + file;
    const sourcePath = SOURCES_DIR + file;
    it(sourcePath, async () => {
      const expectedFiles = new Map();

      (function walk(f) {
        if (!fs.existsSync(f)) {
          return;
        }
        if (fs.lstatSync(f).isDirectory()) {
          for (const file of fs.readdirSync(f)) {
            walk(path.join(f, file));
          }
        } else {
          expectedFiles.set(path.relative(reference, f), fs.readFileSync(f, 'utf8'));
        }
      })(reference);

      const spec = await build(sourcePath, {});

      const actualFiles = handleSingleFileOutput(spec.generatedFiles);

      let threw = true;
      try {
        if (expectedFiles.size === 0) {
          throw new Error('Baseline does not exist');
        }
        assert.deepStrictEqual(actualFiles, expectedFiles);
        threw = false;
      } finally {
        if (threw) {
          for (const [fileToWrite, contents] of actualFiles) {
            const toWrite = path.resolve(dirToWriteOnFailure, path.join(file, fileToWrite ?? ''));
            fs.mkdirSync(path.dirname(toWrite), { recursive: true });
            fs.writeFileSync(toWrite, contents, 'utf8');
          }
          if (rebaseline) {
            console.log('Updated!');
            // we intentionally swallow the exception
            // eslint-disable-next-line no-unsafe-finally
            return;
          }
        }
      }

      if (rebaseline) {
        return;
      }

      const contents = fs.readFileSync(sourcePath, 'utf8');
      const expectedWarnings = [...contents.matchAll(/<!--\s+EXPECT_WARNING(.*?)-->/g)].map(m =>
        JSON.parse(m[1]),
      );
      const warningProps = new Set(expectedWarnings.flatMap(obj => Object.keys(obj)));
      function pickFromWarning(warning: EcmarkupError) {
        if (warningProps.size === 0) {
          // No warnings are expected, so "pick" the entire object.
          return warning;
        }
        const picks: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(warning)) {
          if (warningProps.has(key)) picks[key] = value;
        }
        return picks;
      }

      for (const options of optionsSets) {
        const warnings: EcmarkupError[] = [];
        const warn = (warning: EcmarkupError) => warnings.push(warning);
        const spec = await build(sourcePath, { ...options, warn });
        const actualFiles = handleSingleFileOutput(spec.generatedFiles);
        assert.deepStrictEqual(
          actualFiles,
          expectedFiles,
          `output differed when using option ${JSON.stringify(options)}`,
        );
        assert.deepStrictEqual(
          warnings.map(warning => pickFromWarning(warning)),
          expectedWarnings,
          `warnings differed when using option ${JSON.stringify(options)}`,
        );
      }
    });
  }
});

function handleSingleFileOutput(files: Map<string | null, string | Buffer>) {
  if (files.size === 1 && files.has(null)) {
    // i.e. single-file output
    files.set('', files.get(null)!);
    files.delete(null);
  }
  return files;
}
