#!/usr/bin/env node
'use strict';

const args = require('./args').parse();

// requires after arg checking to avoid expensive load times
const ecmarkup = require('../lib/ecmarkup');
const Promise = require('bluebird');
const Path = require('path');
const fs = require('fs');
const readFile = Promise.promisify(fs.readFile);
const utils = require('../lib/utils');
const debounce = require('promise-debounce');

function fetch(path) {
  return readFile(path, 'utf8');
}

const build = debounce(function build() {
  return ecmarkup.build(args.infile, fetch, args).then(function (spec) {
    if (args.biblio) {
      if (args.verbose) {
        utils.logVerbose('Writing biblio file to ' + args.biblio);
      }
      fs.writeFileSync(args.biblio, JSON.stringify(spec.exportBiblio()), 'utf8');
    }

    if (args.outfile) {
      if (args.verbose) {
        utils.logVerbose('Writing output to ' + args.outfile);
      }
      fs.writeFileSync(args.outfile, spec.toHTML(), 'utf8');
    } else {
      process.stdout.write(spec.toHTML());
    }

    if (args.css) {
      if (args.verbose) {
        utils.logVerbose('Writing css file to ' + args.css);
      }
      fs.writeFileSync(args.css, fs.readFileSync(Path.join(__dirname, '../css/elements.css')));
    }

    if (args.js) {
      if (args.verbose) {
        utils.logVerbose('Writing js file to ' + args.js);
      }
      fs.writeFileSync(args.js, fs.readFileSync(Path.join(__dirname, '../js/menu.js')));
    }

    return spec;
  });
});

if (args.watch) {
  let watching = {};
  build().then(function(spec) {
    let toWatch = spec.imports.concat(args.infile);

    // remove any files that we're no longer watching
    Object.keys(watching).forEach(function(file) {
      if (toWatch.indexOf(file) === -1) {
        watching[file].close();
        delete watching[file];
      }
    });

    // watch any new files
    toWatch.forEach(function(file) {
      if (!watching[file]) {
        watching[file] = fs.watch(file, build);
      }
    });
  });
} else {
  build();
}
