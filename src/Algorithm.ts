import Builder from './Builder';
import emd = require('ecmarkdown');
import { Context } from './Context';
import Grammar from './Grammar';
var __awaiter = require('./awaiter');

/*@internal*/
export default class Algorithm extends Builder {
  static enter(context: Context) {
    const { node } = context;
    // Need to process emu-grammar elements first so emd doesn't trash the syntax inside emu-grammar nodes
    const grammarNodes = node.querySelectorAll('emu-grammar');
    for (let i = 0; i < grammarNodes.length; i++) {
      let gn = grammarNodes[i];
      context.node = gn as HTMLElement;
      Grammar.enter(context);
      Grammar.exit(context);
      context.node = node;
    }
    // replace spaces after !/? with &nbsp; to prevent bad line breaking
    const contents = node.innerHTML.replace(/(\s+[\!\?])\s+(\w+\s*\()/g, '$1&nbsp;$2');
    const html = emd.document(contents);
    node.innerHTML = html;
    context.inAlg = true;
  }

  static exit(context: Context) {
    context.inAlg = false;
  }
  static elements = ['EMU-ALG'];
}