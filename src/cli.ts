#!/usr/bin/env node
'use strict';

import _args = require('./args');
const args = _args.parse();

// requires after arg checking to avoid expensive load times
import ecmarkup = require('./ecmarkup');
import Spec = require('./Spec');
import Promise = require('bluebird');
import path = require('path');
import fs = require('fs');
const readFile = Promise.promisify<string, string, string>(fs.readFile);
import utils = require('./utils');
import debounce = require('promise-debounce');

const jsDependencies = ['menu.js', 'findLocalReferences.js'];

function fetch(path: string) {
  return readFile(path, 'utf8');
}

function concatJs() {
  return jsDependencies.reduce(function (js, dependency) {
    return js + fs.readFileSync(path.join(__dirname, '../js/' + dependency));
  }, '');
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
      fs.writeFileSync(args.css, fs.readFileSync(path.join(__dirname, '../css/elements.css')));
    }

    if (args.js) {
      if (args.verbose) {
        utils.logVerbose('Writing js file to ' + args.js);
      }
      fs.writeFileSync(args.js, concatJs());
    }

    return spec;
  }, err => process.stderr.write(err.stack));
});

if (args.watch) {
  let watching: { [file: string]: fs.FSWatcher } = Object.create(null);
  build().then(spec => {
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
