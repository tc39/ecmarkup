import type Spec from './Spec';
import type Production from './Production';

import Builder from './Builder';

export default class Terminal extends Builder {
  /** @internal */ production: Production;
  /** @internal */ optional: boolean;

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
