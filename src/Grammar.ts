import Builder = require('./Builder');
import gmd = require('grammarkdown');
import GrammarFile = gmd.Grammar;
import EmitFormat = gmd.EmitFormat;
const uncollapsedRe = /:.*\r?\n.*[^\s]+.*(\r?\n|$)/;

/*@internal*/
class Grammar extends Builder {
  build() {
    const content = this.node.textContent!;
    this.node.innerHTML = gmdCompile(content);
  }
}

function gmdCompile(text: string) {
  let out: string | undefined = undefined;
  function readFile(file: string) { return text; }
  function writeFile(file: string, output: string) { out = output; }
  const g = new GrammarFile(['file.grammar'], { format: EmitFormat.ecmarkup }, readFile);
  g.emit(undefined, writeFile);
  return out!;
}

/*@internal*/
export = Grammar;
