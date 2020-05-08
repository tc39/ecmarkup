import type { Context } from './Context';

import Builder from './Builder';
import * as emd from 'ecmarkdown';

/*@internal*/
export default class Algorithm extends Builder {
  static enter(context: Context) {
    const { node } = context;

    // replace spaces after !/? with &nbsp; to prevent bad line breaking
    const html = emd
      .algorithm(node.innerHTML)
      .replace(/((?:\s+|>)[!?])\s+(\w+\s*\()/g, '$1&nbsp;$2');
    node.innerHTML = html;
    context.inAlg = true;
  }

  static exit(context: Context) {
    context.inAlg = false;
  }
  static elements = ['EMU-ALG'];
}
