import Spec from "./Spec";
import { Context } from './Context';

/*@internal*/
export default class Builder {
  public spec: Spec;
  public node: HTMLElement;

  constructor(spec: Spec, node: HTMLElement, ... args: any[]) {
    this.spec = spec;
    this.node = node;
  }
  
  static enter(context: Context): PromiseLike<void> | void {
    throw new Error('Builder not implemented');
  }
  static exit(context: Context): PromiseLike<void> | void { } 
  static elements: string[] = [];
}