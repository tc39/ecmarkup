"use strict";
const Builder = require('./Builder');
const gmd = require('grammarkdown');
var GrammarFile = gmd.Grammar;
var EmitFormat = gmd.EmitFormat;
const uncollapsedRe = /:.*\r?\n.*[^\s]+.*(\r?\n|$)/;
/*@internal*/
class Grammar extends Builder {
    build() {
        const content = this.node.textContent;
        this.node.innerHTML = gmdCompile(content);
    }
}
function gmdCompile(text) {
    let out = undefined;
    function readFile(file) { return text; }
    function writeFile(file, output) { out = output; }
    const g = new GrammarFile(['file.grammar'], { format: EmitFormat.ecmarkup }, readFile);
    g.emit(undefined, writeFile);
    return out;
}
module.exports = Grammar;
//# sourceMappingURL=Grammar.js.map