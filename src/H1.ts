import { Context } from './Context';
import Builder from './Builder';

/*@internal*/
export default class H1 extends Builder {
  static enter({ node, clauseStack }: Context) {
    const clause = clauseStack[clauseStack.length - 1];
    if (clause && !clause.header) {
      clause.header = node as HTMLHeadingElement;
    }
  }
  static exit(context: Context) { };
  static elements = ['H1'];
}