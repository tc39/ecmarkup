'use strict';

const Builder = require('./Builder');
const gmd = require('grammarkdown');
const GrammarFile = gmd.Grammar;
const EmitFormat = gmd.EmitFormat;
const uncollapsedRe = /:.*\r?\n.*[^\s]+.*(\r?\n|$)/;

module.exports = class Grammar extends Builder {
  build() {
    let content = this.node.innerHTML;
    // hack - grammarkdown doesn't handle html entities but most usages of
    // ecmarkup use &lt; and &gt; extensively in emu-gramar (eg. lookaheads)
    content = content.replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&');
    this.node.innerHTML = gmdCompile(content);
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
