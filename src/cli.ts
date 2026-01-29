import type { EcmarkupError, Options } from './ecmarkup';

import * as commandLineUsage from 'command-line-usage';
import * as path from 'path';
import * as fs from 'fs';
import * as ecmarkup from './ecmarkup';
import * as utils from './utils';
import { options } from './args';
import { parse } from './arg-parser';
import type { ExportedBiblio } from './Biblio';

const debounce: (_: () => Promise<void>) => () => Promise<void> = require('promise-debounce');

function usage() {
  console.log(
    commandLineUsage([
      {
        header: 'ecmarkup',
        content: 'Compile ecmarkup documents to html.',
      },
      {
        header: 'Usage',
        content: ['ecmarkup in.emu out.html', 'ecmarkup --multipage in.emu out/'],
      },
      {
        header: 'Options',
        hide: ['files', 'js-out', 'css-out', 'old-toc'],
        optionList: options as unknown as commandLineUsage.OptionDefinition[],
      },
    ]),
  );
}

function fail(msg: string): never {
  console.error(msg);
  process.exit(1);
}

const args = parse(options, usage);

if (args.version) {
  const p = require(path.resolve(__dirname, '..', 'package.json'));
  console.log(`ecmarkup v${p.version}`);
  process.exit(0);
}

for (const [key, value] of Object.entries(args)) {
  if (value === null) {
    fail(`--${key} requires an argument`);
  }
}

if (args.files.length < 1) {
  fail('You must specify an input file');
}

if (args.files.length > 2) {
  fail('Found extra argument ' + args.files[2]);
}
const infile = args.files[0];
const outfile = args.files[1];

if (args.strict && args.watch) {
  fail('Cannot use --strict with --watch');
}

if (args['old-toc']) {
  fail('--old-toc has been removed; specify --printable to get a printable document');
}

if (args['js-out'] || args['css-out']) {
  fail('--js-out and --css-out have been removed; specify --assets-dir instead');
}

if (args.assets != null && !['none', 'inline', 'external'].includes(args.assets)) {
  fail('--assets must be "none", "inline", or "external"');
}

if (args.assets != null && args.assets !== 'external' && args['assets-dir'] != null) {
  fail(`--assets=${args.assets} cannot be used with --assets-dir"`);
}

if (args.multipage) {
  if (args.assets != null && !['none', 'inline'].includes(args.assets)) {
    fail('--multipage implies --assets=external');
  }

  if (!outfile) {
    fail('When using --multipage you must specify an output directory');
  }

  if (fs.existsSync(outfile) && !fs.lstatSync(outfile).isDirectory()) {
    fail('When using --multipage, outfile (' + outfile + ') must be a directory');
  }

  fs.mkdirSync(path.resolve(outfile, 'multipage'), { recursive: true });
}

const LOOKS_LIKE_FILE_REGEX = /^\.{0,2}\//;

const watching = new Map<string, fs.FSWatcher>();
const build = debounce(async function build() {
  try {
    const opts: Options = {
      multipage: args.multipage,
      outfile,
      extraBiblios: [],
      lintSpec: !!args['lint-spec'],
    };
    if (args.verbose) {
      opts.log = utils.logVerbose;
    }
    if (args['mark-effects']) {
      opts.markEffects = true;
    }
    if (args['max-clause-depth']) {
      opts.maxClauseDepth = args['max-clause-depth'];
    }
    if (args['no-toc'] != null) {
      opts.toc = !args['no-toc'];
    }
    if (args.printable != null) {
      opts.printable = args.printable;
    }

    if (args.assets != null) {
      opts.assets = args.assets as 'none' | 'inline' | 'external';
    }
    if (args['assets-dir'] != null) {
      opts.assetsDir = args['assets-dir'];
    }

    let warned = false;

    for (let toResolve of args['load-biblio'] ?? []) {
      if (LOOKS_LIKE_FILE_REGEX.test(toResolve)) {
        toResolve = path.resolve(process.cwd(), toResolve);
      }
      try {
        const bib = require(toResolve) as ExportedBiblio | ExportedBiblio[];
        if (Array.isArray(bib)) {
          opts.extraBiblios!.push(...bib);
        } else {
          opts.extraBiblios!.push(bib);
        }
      } catch {
        fail(`could not find biblio ${toResolve}`);
      }
    }

    const errorFormatter = args['error-formatter'];
    let toResolve = errorFormatter;
    if (LOOKS_LIKE_FILE_REGEX.test(errorFormatter)) {
      toResolve = path.resolve(process.cwd(), errorFormatter);
    }
    let formatter;
    try {
      formatter = require(toResolve);
    } catch {
      fail(`could not find formatter ${errorFormatter}`);
    }
    const warnings: EcmarkupError[] = [];
    opts.warn = err => {
      warned = true;
      const file = normalizePath(err.file ?? args.files[0]);
      // prettier-ignore
      const message = `${args.strict ? 'Error' : 'Warning'}: ${file}:${err.line == null ? '' : `${err.line}:${err.column}:`} ${err.message}`;
      utils.logWarning(message);
      warnings.push(err);
    };

    // Respect a reproducible build timestamp.
    // https://reproducible-builds.org/specs/source-date-epoch/
    if (process.env.SOURCE_DATE_EPOCH) {
      const sde = process.env.SOURCE_DATE_EPOCH.trim();
      if (!/^[0-9]+$/.test(sde)) {
        fail(`SOURCE_DATE_EPOCH value ${sde} is not valid`);
      }
      const ts = +sde;
      opts.date = new Date(ts * 1000);
    }

    const spec = await ecmarkup.build(args.files[0], utils.readFile, opts);

    if (args.verbose) {
      utils.logVerbose(warned ? 'Completed with errors.' : 'Done.');
    }

    const pending: Promise<void>[] = [];
    if (args['write-biblio']) {
      if (args.verbose) {
        utils.logVerbose('Writing biblio file to ' + args['write-biblio']);
      }
      const exported = spec.exportBiblio();
      if (exported != null) {
        pending.push(utils.writeFile(args['write-biblio'], JSON.stringify(exported)));
      }
    }

    if (args.verbose && warned) {
      warnings.sort((a, b) => {
        const aPath = normalizePath(a.file ?? infile);
        const bPath = normalizePath(a.file ?? infile);
        if (aPath !== bPath) {
          return aPath.localeCompare(bPath);
        }
        if (a.line === b.line) {
          if (a.column === b.column) {
            return 0;
          }
          if (a.column == null) {
            return -1;
          }
          if (b.column == null) {
            return 1;
          }
          return a.column - b.column;
        }
        if (a.line == null) {
          return -1;
        }
        if (b.line == null) {
          return 1;
        }
        return a.line - b.line;
      });
      const results = warnings.map(err => ({
        filePath: normalizePath(err.file ?? infile),
        messages: [{ severity: args.strict ? 2 : 1, ...err }],
        errorCount: args.strict ? 1 : 0,
        warningCount: args.strict ? 0 : 1,
        // for now, nothing is fixable
        fixableErrorCount: 0,
        fixableWarningCount: 0,
        source: err.source,
      }));

      console.error(formatter(results));
    }

    if (!args.strict || !warned) {
      if (outfile) {
        if (args.verbose) {
          utils.logVerbose('Writing output...');
        }
        for (const [file, contents] of spec.generatedFiles) {
          pending.push(utils.writeFile(file!, contents));
        }
      } else {
        process.stdout.write(spec.generatedFiles.get(null)!);
      }
    }

    await Promise.all(pending);

    if (args.strict && warned) {
      utils.logVerbose(
        'Exiting with an error due to errors (omit --strict to write output anyway)',
      );
      if (!args.verbose) {
        utils.logVerbose('Rerun with --verbose to see detailed error information');
      }
      process.exit(1);
    }

    if (args.watch) {
      const toWatch = new Set<string>(spec.imports.map(i => i.importLocation).concat(infile));

      // remove any files that we're no longer watching
      for (const [file, watcher] of watching) {
        if (!toWatch.has(file)) {
          watcher.close();
          watching.delete(file);
        }
      }

      // watch any new files
      for (const file of toWatch) {
        if (!watching.has(file)) {
          watching.set(file, fs.watch(file, build));
        }
      }
    }
  } catch (e) {
    if (args.watch) {
      process.stderr.write(e instanceof Error ? e.stack ?? e.message : String(e));
    } else {
      throw e;
    }
  }
});

build().catch(e => {
  console.error(e);
  process.exit(1);
});

function normalizePath(absolute: string) {
  return path.relative(process.cwd(), absolute);
}
