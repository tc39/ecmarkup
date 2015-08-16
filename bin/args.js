'use strict';
var path = require('path');

module.exports = require('nomnom')
  .script('ecmarkup')
  .help('Compile ecmarkup documents to html by passing your input file and output file.')
  .options({
    help: { abbr: 'h', flag: true, help: 'Display this help message' },
    biblio: { abbr: 'b', metavar: 'FILE', help: 'Write a biblio file to FILE' },
    toc: { flag: true, help: 'Don\'t include the table of contents' },
    verbose: { flag: true, default: false, help: 'Display document build progress' },
    version: {
      abbr: 'v',
      flag: true,
      help: 'Display version info',
      callback: printVersion
    },
    infile: {
      position: 0,
      help: 'Input ecmarkup file',
      required: true
    },
    outfile: {
      position: 1,
      help: 'Output html or biblio file',
    }
  });

function printVersion() {
  var p = require(path.resolve(__dirname, '..', 'package.json'));
  return 'ecmarkup v' + p.version;
}
