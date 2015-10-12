'use strict';

const Builder = require('./Builder');
const gmd = require('grammarkdown');
const GrammarFile = gmd.Grammar;
const EmitFormat = gmd.EmitFormat;
const uncollapsedRe = /:.*\r?\n.*[^\s]+.*(\r?\n|$)/;

const gmdCompile = function (text) {
  let out;
  function readFile(file) { return text; }
  function writeFile(file, output) { out = output; }
  const g = new GrammarFile(['file.grammar'], { format: EmitFormat.ecmarkup }, readFile);
  g.emit(undefined, writeFile);

  return out;
};

module.exports = class Grammar extends Builder {
  build() {
    const content = this.node.textContent;
    // hack until grammarkdown supports collapsed productions
    if (!content.match(uncollapsedRe)) {
      this.node.setAttribute('collapsed', '');
    }

    this.node.innerHTML = gmdCompile(this.node.textContent);
  }
};
