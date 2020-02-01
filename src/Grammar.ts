import Builder from './Builder';
import { CompilerOptions, Grammar as GrammarFile, EmitFormat } from 'grammarkdown';
import { Context } from './Context';
let __awaiter = require('./awaiter');

const endTagRe = /<\/?(emu-\w+|h?\d|p|ul|table|pre|code)\b[^>]*>/i;
const globalEndTagRe = /<\/?(emu-\w+|h?\d|p|ul|table|pre|code)\b[^>]*>/ig;

/*@internal*/
export default class Grammar extends Builder {
  static enter({spec, node, inAlg}: Context) {
    // we process grammar nodes in algorithms separately (in Algorithm.ts)
    if (inAlg) return;

    let content: string;
    let possiblyMalformed = true;
    if (spec.sourceText) {
      // If the source text is available, we should use it since `innerHTML` serializes the
      // DOM tree beneath the node. This can result in odd behavior when the syntax is malformed
      // in a way that parse5 does not understand, but grammarkdown could possibly recover.
      const location = spec.dom.nodeLocation(node);
      if (location) {
        if (location.startTag && location.endTag) {
          // the parser was able to find a matching end tag.
          const start = location.startTag.endOffset as number;
          const end = location.endTag.startOffset as number;
          content = spec.sourceText.slice(start, end);
        } else {
          // the parser was *not* able to find a matching end tag. Try to recover by finding a
          // possible end tag, otherwise read the rest of the source text.
          const start = globalEndTagRe.lastIndex = location.endOffset as number;
          const match = globalEndTagRe.exec(spec.sourceText);
          const end = match ? match.index : spec.sourceText.length;
          content = spec.sourceText.slice(start, end);

          // since we already tested for an end tag, no need to test again later.
          possiblyMalformed = false;
          globalEndTagRe.lastIndex = 0;
        }
      } else {
        // can't read location for whatever reason, so fallback to innerHTML
        content = node.innerHTML;
      }
    } else {
      // no source text, so read innerHTML as a fallback.
      content = node.innerHTML;
    }

    if (possiblyMalformed) {
      // check for a possible end-tag in the content. For now we only check for a few possible
      // recovery cases, namely emu-* tags, and a few block-level elements.
      const match = endTagRe.exec(content);
      if (match) {
        content = content.slice(0, match.index);
      }
    }

    const options: CompilerOptions = {
      format: EmitFormat.ecmarkup,
      noChecks: true
    };

    node.innerHTML = GrammarFile.convert(content, options, /*hostFallback*/ undefined, spec.cancellationToken);
  }

  static elements = ['EMU-GRAMMAR'];
}