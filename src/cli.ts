import type { Options } from './ecmarkup';
import type { LintingError } from './lint/algorithm-error-reporter-type';

import { argParser } from './args';
const args = argParser.parse();

import * as fs from 'fs';
import * as ecmarkup from './ecmarkup';
import * as utils from './utils';

const debounce: (_: () => Promise<void>) => () => Promise<void> = require('promise-debounce');

// back compat to old argument names
if (args.css) {
  args.cssOut = args.css;
}

if (args.js) {
  args.jsOut = args.js;
}

if (args.strict && args.watch) {
  console.error('Cannot use --strict with --watch');
  process.exit(1);
}

const watching = new Map<string, fs.FSWatcher>();
const build = debounce(async function build() {
  try {
    const opts: Options = { ...args };
    if (args.verbose) {
      opts.log = utils.logVerbose;
    }
    let warned = false;
    {
      let descriptor = `eslint/lib/cli-engine/formatters/${args.lintFormatter}.js`;
      try {
        require.resolve(descriptor);
      } catch {
        descriptor = args.lintFormatter;
      }
      let formatter = require(descriptor);
      opts.warn = err => {
        warned = true;

        // TODO fix this
        let results = [
          {
            filePath: args.infile,
            messages: [{ severity: args.strict ? 2 : 1, ...err }],
            errorCount: args.strict ? 1 : 0,
            warningCount: args.strict ? 0 : 1,
            // for now, nothing is fixable
            fixableErrorCount: 0,
            fixableWarningCount: 0,
            source: require('fs').readFileSync(args.infile, 'utf8'), // TODO not this
          },
        ];

        console.error(formatter(results));
        //utils.logWarning(str);
      };
    }

    if (args.lintSpec) {
      let descriptor = `eslint/lib/cli-engine/formatters/${args.lintFormatter}.js`;
      try {
        require.resolve(descriptor);
      } catch {
        descriptor = args.lintFormatter;
      }
      let formatter = require(descriptor);

      opts.reportLintErrors = (errors: LintingError[], sourceText: string) => {
        if (errors.length < 1) return;

        let results = [
          {
            filePath: args.infile,
            messages: errors.map(e => ({ severity: args.strict ? 2 : 1, ...e })),
            errorCount: args.strict ? errors.length : 0,
            warningCount: args.strict ? 0 : errors.length,
            // for now, nothing is fixable
            fixableErrorCount: 0,
            fixableWarningCount: 0,
            source: sourceText,
          },
        ];

        warned = true;
        console.error(formatter(results));
      };
    }
    const spec = await ecmarkup.build(args.infile, utils.readFile, opts);

    const pending: Promise<any>[] = [];
    if (args.biblio) {
      if (args.verbose) {
        utils.logVerbose('Writing biblio file to ' + args.biblio);
      }
      pending.push(utils.writeFile(args.biblio, JSON.stringify(spec.exportBiblio())));
    }

    if (args.outfile) {
      if (args.verbose) {
        utils.logVerbose('Writing output to ' + args.outfile);
      }
      pending.push(utils.writeFile(args.outfile, spec.toHTML()));
    } else {
      process.stdout.write(spec.toHTML());
    }

    await Promise.all(pending);

    if (args.strict && warned) {
      if (args.verbose) {
        utils.logVerbose('Exiting with an error due to warnings');
      }
      process.exit(1);
    }

    if (args.watch) {
      const toWatch = new Set<string>(spec.imports.map(i => i.importLocation).concat(args.infile));

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
      process.stderr.write(e.stack);
    } else {
      throw e;
    }
  }
});

build().catch(e => {
  console.error(e);
  process.exit(1);
});
