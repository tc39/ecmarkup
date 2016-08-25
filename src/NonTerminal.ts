import Builder = require('./Builder');
import utils = require('./utils');
import Spec = require('./Spec');

/*@internal*/
class NonTerminal extends Builder {
  params: string | null;
  optional: boolean;
  namespace: string;

  constructor(spec: Spec, node: HTMLElement) {
    super(spec, node);

    this.params = node.getAttribute('params');
    this.optional = node.hasAttribute('optional');
    this.namespace = utils.getNamespace(spec, node);
  }

  build() {
    const name = this.node.textContent!;
    const id = 'prod-' + name;
    const entry = this.spec.biblio.byProductionName(name, this.namespace);
    if (entry) {
      this.node.innerHTML = '<a href="' + entry.location + '#' + entry.id + '">' + name + '</a>';
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

/*@internal*/
export = NonTerminal;