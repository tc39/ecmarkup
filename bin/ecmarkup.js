#!/usr/bin/env node

var ecmarkup = require('../lib/ecmarkup');
var infile = process.argv[2];
var outfile = process.argv[3];
var fs = require('fs');
var Promise = require('bluebird');
var readFile = Promise.promisify(fs.readFile);

ecmarkup.build(infile, function fetch(path) {
  return readFile(path, 'utf8');
}).then(function(out) {
  fs.writeFileSync(outfile, out, 'utf8');
});
