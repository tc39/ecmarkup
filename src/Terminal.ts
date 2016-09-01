import Builder from './Builder';
import Spec from "./Spec";
import Production from "./Production";

/*@internal*/
export default class Terminal extends Builder {
  production: Production;
  optional: boolean;

  constructor(spec: Spec, prod: Production, node: HTMLElement) {
    super(spec, node);
    this.production = prod;

    this.optional = node.hasAttribute('optional');
  }

  build(): void {
    let modifiers = '';

    if (this.optional) {
      modifiers += '<emu-opt>opt</emu-opt>';
    }

    if (modifiers === '') return;

    const el = this.spec.doc.createElement('emu-mods');
    el.innerHTML = modifiers;

    this.node.appendChild(el);
  }
}