import * as fsSync from 'fs';
import * as path from 'path';
import * as fastGlob from 'fast-glob';

import { printDocument } from './ecmarkup';
import { parse as parseArguments } from '../arg-parser';
import * as commandLineUsage from 'command-line-usage';

const fs = fsSync.promises;

const ignored = ['.git', '.svn', '.hg', 'node_modules'];

const options = [
  {
    name: 'help',
    type: Boolean,
    description: 'Display this help message',
  },
  {
    name: 'check',
    type: Boolean,
    description:
      'Exit with 1 if running with --write would cause at least some file to change (and print a list of such files); otherwise exit with 0.',
  },
  {
    name: 'write',
    type: Boolean,
    description: 'Overwrite the specified files instead of printing to standard out.',
  },
  {
    name: 'would-write',
    type: Boolean,
    description:
      'Print a list of files matched by the pattern and exit without further processing.',
  },
  {
    name: 'patterns',
    type: String,
    multiple: true,
    defaultOption: true,
  },
] as const;

function usage() {
  console.log(
    commandLineUsage([
      {
        content: ['Usage: emu-format [--write|--would-write|--check] src.emu'],
      },
      {
        header: 'Options',
        hide: ['patterns'],
        optionList: options as unknown as commandLineUsage.OptionDefinition[],
      },
    ])
  );
}

(async () => {
  const args = parseArguments(options, usage);

  const { patterns, check, write, 'would-write': wouldWrite } = args;

  if (check && (write || wouldWrite)) {
    console.error(`--check cannot be combined with --write or --would-write`);
    process.exit(1);
  }

  if (patterns.length === 0) {
    usage();
    process.exit(1);
  }

  // can't use flatmap when the mapper is async, sigh
  const files = (await Promise.all(patterns.map(expandGlob))).flat();

  if (files.length === 0) {
    console.error(
      `Did not find any files matching ${patterns.map(p => JSON.stringify(p)).join(', ')}`
    );
    process.exit(1);
  }
  if (
    !write &&
    !wouldWrite &&
    !check &&
    (patterns.length > 1 || files.length > 1 || files[0] !== patterns[0])
  ) {
    console.error(
      `When processing multiple files or a glob pattern you must specify --write, --would-write, or --check`
    );
    process.exit(1);
  }

  if (wouldWrite) {
    console.log('Files to be processed:');
    console.log(files.join('\n'));
    process.exit(0);
  }

  const touched = [];
  if (!write) {
    const input = await fs.readFile(files[0], 'utf8');
    const printed = await printDocument(input);
    if (check) {
      if (printed !== input) {
        touched.push(files[0]);
      }
    } else {
      // printDocument includes a newline
      process.stdout.write(printed);
    }
  } else {
    for (const file of files) {
      console.log(`Processing ${file}`);
      const input = await fs.readFile(file, 'utf8');
      const printed = await printDocument(input);
      if (printed !== input) {
        if (check) {
          touched.push(file);
        } else {
          await fs.writeFile(file, printed, 'utf8');
        }
      }
    }
  }
  if (touched.length > 0) {
    console.log('Need formatting:');
    for (const file of touched) {
      console.log(file);
    }
    process.exit(1);
  }
})().catch(e => {
  console.error(e);
  process.exit(1);
});

async function expandGlob(pattern: string) {
  const cwd = process.cwd();

  const absolute = path.resolve(cwd, pattern);

  const asPath = await stat(absolute);
  if (asPath?.isFile()) {
    return [pattern];
  }
  if (asPath?.isDirectory()) {
    if (pattern.endsWith('/')) {
      pattern = pattern.slice(0, -1);
    }
    pattern += '/**/*.{emu,html}';
  }

  if (path.sep === '\\') {
    // fscking windows
    pattern = pattern.replace(/\\/g, '/');
  }

  const dots = pattern.match(/^(\.\.?\/)+/)?.[0] ?? '';
  return await fastGlob(pattern, { ignore: ignored.map(i => dots + '**/' + i) });
}

async function stat(path: string) {
  try {
    return await fs.stat(path);
  } catch (error: any) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
    return null;
  }
}
