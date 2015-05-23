#!/usr/bin/env node

var ecmarkup = require('../lib/ecmarkup');
var Promise = require('bluebird');
var path = require('path');
var fs = require('fs');
var readFile = Promise.promisify(fs.readFile);

if(process.argv[2] === "-v") {
  printVersion();
  process.exit();
}

var infile = process.argv[2];
var outfile = process.argv[3];

if(!infile || !outfile) {
  printUsage();
  process.exit(1);
}

ecmarkup.build(infile, function fetch(path) {
  return readFile(path, 'utf8');
}).then(function(out) {
  fs.writeFileSync(outfile, out, 'utf8');
});

function printUsage() {
  printVersion();
  console.log("Usage: ecmarkup source_file target_file");
  console.log("");
  console.log("Options:");
  console.log(" -v\tPrint ecmarkup version")
}

function printVersion() {
  var p = require(path.resolve(__dirname, "..", "package.json"));
  console.log("ecmarkup v" + p.version);
}
