import * as path from 'path';
import * as nomnom from 'nomnom';

export const argParser = nomnom
  .script('ecmarkup')
  .help('Compile ecmarkup documents to html by passing your input file and output file.')
  .options({
    help: { abbr: 'h', flag: true, help: 'Display this help message' },
    watch: { abbr: 'w', flag: true, help: 'Rebuild when files change' },
    biblio: { abbr: 'b', metavar: 'FILE', help: 'Write a biblio file to FILE' },
    ecma262Biblio: {
      full: 'ecma-262-biblio',
      flag: true,
      default: true,
      help: 'Load ECMA-262 biblio file',
    },
    assets: { choices: ['none', 'inline', 'external'], help: 'Link to css and js assets' },
    cssOut: { full: 'css-out', metavar: 'FILE', help: 'Write Emu CSS dependencies to FILE' },
    jsOut: { full: 'js-out', metavar: 'FILE', help: 'Write Emu JS dependencies to FILE' },
    toc: { flag: true, help: "Don't include the table of contents" },
    oldToc: { full: 'old-toc', flag: true, help: 'Use the old table of contents styling' },
    lintSpec: {
      full: 'lint-spec',
      flag: true,
      default: false,
      help: 'Enforce some style and correctness checks',
    },
    lintFormatter: {
      full: 'lint-formatter',
      metavar: 'FORMAT',
      default: 'codeframe',
      help:
        'The linting output formatter. Either the name of a built-in eslint formatter or the package name of an installed eslint compatible formatter.',
    },
    verbose: { flag: true, default: false, help: 'Display document build progress' },
    version: {
      abbr: 'v',
      flag: true,
      help: 'Display version info',
      callback: printVersion,
    },
    infile: {
      position: 0,
      help: 'Input ecmarkup file',
      required: true,
    },
    outfile: {
      position: 1,
      help: 'Output html or biblio file',
    },
  });

function printVersion() {
  const p = require(path.resolve(__dirname, '..', 'package.json'));
  return 'ecmarkup v' + p.version;
}
