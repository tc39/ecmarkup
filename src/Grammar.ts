import Builder = require('./Builder');
import jsdom = require('jsdom');
import { Host, CompilerOptions, Grammar as GrammarFile, EmitFormat } from 'grammarkdown';

const endTagRe = /<\/?(emu-\w+|h?\d|p|ul|table|pre|code)\b[^>]*>/i;
const globalEndTagRe = /<\/?(emu-\w+|h?\d|p|ul|table|pre|code)\b[^>]*>/ig;
const entityRe = /&(gt|lt|amp);/g;
const entities: { [key: string]: string } = {
  "&gt;": ">",
  "&lt;": "<",
  "&amp;": "&"
};

/*@internal*/
class Grammar extends Builder {
  build() {
    let content: string;
    let possiblyMalformed = true;
    if (this.spec.sourceText) {
      // If the source text is available, we should use it since `innerHTML` serializes the
      // DOM tree beneath the node. This can result in odd behavior when the syntax is malformed
      // in a way that parse5 does not understand, but grammarkdown could possibly recover.
      const location = jsdom.nodeLocation(this.node);
      if (location.startTag && location.endTag) {
        // the parser was able to find a matching end tag.
        const start = location.startTag.end as number;
        const end = location.endTag.start as number;
        content = this.spec.sourceText.slice(start, end);
      }
      else {
        // the parser was *not* able to find a matching end tag. Try to recover by finding a
        // possible end tag, otherwise read the rest of the source text.
        const start = globalEndTagRe.lastIndex = location.end as number;
        const match = globalEndTagRe.exec(this.spec.sourceText);
        const end = match ? match.index : this.spec.sourceText.length;
        content = this.spec.sourceText.slice(start, end);

        // since we already tested for an end tag, no need to test again later.
        possiblyMalformed = false;
        globalEndTagRe.lastIndex = 0;
      }
    }
    else {
      // no source text, so read innerHTML as a fallback.
      content = this.node.innerHTML;
    }

    if (possiblyMalformed) {
      // check for a possible end-tag in the content. For now we only check for a few possible
      // recovery cases, namely emu-* tags, and a few block-level elements.
      const match = endTagRe.exec(content);
      if (match) {
        content = content.slice(0, match.index);
      }
    }

    // grammarkdown doesn't handle html entities but most usages of
    // ecmarkup use &lt; and &gt; extensively in emu-grammar (eg. lookaheads)
    content = content.replace(entityRe, entity => entities[entity]);

    const host = Host.getHost({
      readFile: file => content,
      writeFile: (_, output) => content = output
    });

    const options: CompilerOptions = {
      format: EmitFormat.ecmarkup,
      noChecks: true
    };

    const grammar = new GrammarFile(['file.grammar'], options, host, /*oldGrammar*/ undefined, this.spec.cancellationToken);
    grammar.emit(); // updates content

    this.node.innerHTML = content;
  }
}

/*@internal*/
export = Grammar;
