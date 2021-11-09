import * as fsSync from 'fs';
import * as path from 'path';
import * as fastGlob from 'fast-glob';

import { printDocument } from './ecmarkup';

const fs = fsSync.promises;

const ignored = ['.git', '.svn', '.hg', 'node_modules'];

if (process.argv.length < 3) {
  usage(1);
}
if (process.argv.includes('--help')) {
  usage(0);
}

(async () => {
  const args = process.argv.slice(2);
  const dashDash = args.indexOf('--');
  let toParseForFlags: string[];
  let toNotParse: string[];
  if (dashDash !== -1) {
    toParseForFlags = args.slice(0, dashDash);
    toNotParse = args.slice(dashDash + 1);
  } else {
    toParseForFlags = args;
    toNotParse = [];
  }

  const write = getFlag(toParseForFlags, '--write');
  const wouldWrite = getFlag(toParseForFlags, '--would-write');
  const check = getFlag(toParseForFlags, '--check');

  const unknown = toParseForFlags.filter(f => f.startsWith('--'));
  if (unknown.length > 0) {
    console.error(`Unknown flag${unknown.length > 1 ? 's' : ''} ${unknown.join(', ')}`);
    process.exit(1);
  }

  if (check && (write || wouldWrite)) {
    console.error(`--check cannot be combined with --write or --would-write`);
    process.exit(1);
  }

  const patterns = toParseForFlags.concat(toNotParse);

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

function getFlag(args: string[], flag: string) {
  const index = args.indexOf(flag);
  if (index === -1) {
    return false;
  }
  args.splice(index, 1);
  return true;
}

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
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
    return null;
  }
}

function usage(exitCode: 0 | 1): never {
  console.log(`Usage: emu-format [--write|--would-write|--check] src.emu

You can also specify multiple files or a glob pattern, in which case you must also specify --write.

--write: Overwrite the specified files instead of print to standard out.

--would-write: print a list of files matched by the pattern and exit without further processing.

--check: exit with 1 if running with \`--write\` would cause at least some file to change (and print a list of such files); otherwise exit with 0.

If using a glob, only files whose names end in \`.html\` or \`.emu\` are matched.
`);
  process.exit(exitCode);
}
