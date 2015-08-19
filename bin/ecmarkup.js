#!/usr/bin/env node
'use strict';

const args = require('./args').parse();

// requires after arg checking to avoid expensive load times
const ecmarkup = require('../lib/ecmarkup');
const Promise = require('bluebird');
const fs = require('fs');
const readFile = Promise.promisify(fs.readFile);

function fetch(path) {
  return readFile(path, 'utf8');
}

ecmarkup.build(args.infile, fetch, args).then(function (spec) {
  if (args.biblio) {
    fs.writeFileSync(args.biblio, JSON.stringify(spec.exportBiblio()), 'utf8');
  }

  if (args.outfile) {
    fs.writeFileSync(args.outfile, spec.toHTML(), 'utf8');
  } else {
    process.stdout.write(spec.toHTML());
  }
});
