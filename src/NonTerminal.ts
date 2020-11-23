import type Spec from './Spec';
import type { Context } from './Context';
import type { BiblioEntry } from './Biblio';

import Builder from './Builder';

/*@internal*/
export default class NonTerminal extends Builder {
  params: string | null;
  optional: boolean;
  namespace: string;
  entry?: BiblioEntry;

  static elements = ['EMU-NT'];

  constructor(spec: Spec, node: HTMLElement, namespace: string) {
    super(spec, node);

    this.params = node.getAttribute('params');
    this.optional = node.hasAttribute('optional');
    this.namespace = namespace;
  }

  static async enter({ spec, node, clauseStack }: Context) {
    const clause = clauseStack[clauseStack.length - 1];
    const namespace = clause ? clause.namespace : spec.namespace;
    const nt = new NonTerminal(spec, node, namespace);
    spec._ntRefs.push(nt);
  }

  build() {
    const name = this.node.textContent!;
    // const id = 'prod-' + name;
    const entry = this.spec.biblio.byProductionName(name, this.namespace);

    if (entry) {
      this.node.innerHTML = '<a href="' + entry.location + '#' + entry.id + '">' + name + '</a>';
      this.entry = entry;
    } else {
      this.node.innerHTML = name;
    }
    let modifiers = '';

    if (this.params) {
      modifiers += '<emu-params>[' + this.params + ']</emu-params>';
    }

    if (this.optional) {
      modifiers += '<emu-opt>opt</emu-opt>';
    }

    if (modifiers.length > 0) {
      const el = this.spec.doc.createElement('emu-mods');
      el.innerHTML = modifiers;
      this.node.appendChild(el);
    }
  }
}
