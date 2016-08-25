import Spec = require("./Spec");

/*@internal*/
class Builder {
  public spec: Spec;
  public node: HTMLElement;

  constructor(spec: Spec, node: HTMLElement) {
    this.spec = spec;
    this.node = node;
  }

  build(...args: any[]): void | PromiseLike<void> {
    throw new Error('Builder not implemented');
  }
}

/*@internal*/
export = Builder;