import Spec from "./Spec";
import { Context } from './Context';
import * as utils from './utils';

const nodeIds = new Set<string>();

/*@internal*/
export default class Builder {
  public spec: Spec;
  public node: HTMLElement;

  constructor(spec: Spec, node: HTMLElement, ... args: any[]) {
    this.spec = spec;
    this.node = node;

    let nodeId = node.getAttribute('id')!;

    if (nodeId !== null) {
      if (nodeIds.has(nodeId)) {
        this._log(`<${node.tagName.toLowerCase()}> has duplicate id: ${nodeId}`);
      }
      nodeIds.add(nodeId);
    }
  }

  /*@internal*/
  _log(str: string) {
    if (!this.spec.opts.verbose) return;
    utils.logWarning(str);
  }

  static enter(context: Context): PromiseLike<void> | void {
    throw new Error('Builder not implemented');
  }
  static exit(context: Context): PromiseLike<void> | void { } 
  static elements: string[] = [];
}