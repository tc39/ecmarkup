import type { Context } from './Context';

import Builder from './Builder';
import * as emd from 'ecmarkdown';

/*@internal*/
export default class Algorithm extends Builder {
  static enter(context: Context) {
    context.inAlg = true;
    const { node } = context;

    if ('ecmarkdownOut' in node) {
      // i.e., we already parsed this during the lint phase
      // @ts-ignore
      node.innerHTML = node.ecmarkdownOut.replace(/((?:\s+|>)[!?])\s+(\w+\s*\()/g, '$1&nbsp;$2');
      return;
    }

    // replace spaces after !/? with &nbsp; to prevent bad line breaking
    const html = emd
      .algorithm(node.innerHTML)
      .replace(/((?:\s+|>)[!?])\s+(\w+\s*\()/g, '$1&nbsp;$2');
    node.innerHTML = html;
  }

  static exit(context: Context) {
    context.inAlg = false;
  }
  static elements = ['EMU-ALG'];
}
