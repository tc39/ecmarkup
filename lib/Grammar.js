'use strict';

const Builder = require('./Builder');
const gmd = require('grammarkdown');
const GrammarFile = gmd.Grammar;
const EmitFormat = gmd.EmitFormat;
const uncollapsedRe = /:.*\r?\n.*[^\s]+.*(\r?\n|$)/;

module.exports = class Grammar extends Builder {
  build() {
    const content = this.node.textContent;
    this.node.innerHTML = gmdCompile(this.node.textContent);
  }
};

function gmdCompile(text) {
  let out;
  function readFile(file) { return text; }
  function writeFile(file, output) { out = output; }
  const g = new GrammarFile(['file.grammar'], { format: EmitFormat.ecmarkup }, readFile);
  g.emit(undefined, writeFile);

  return out;
}
