import Builder from './Builder';
import Production from './Production';
import { Context } from './Context';
import Spec from './Spec';
import { shouldInline } from './utils';

/*@internal*/
export default class ProdRef extends Builder {
  public namespace: string;
  public name: string;

  static elements = ['EMU-PRODREF'];

  constructor (spec: Spec, node: HTMLElement, namespace: string) {
    super(spec, node);
    this.spec = spec;
    this.node = node;
    this.namespace = namespace;
    this.name = node.getAttribute('name')!;
  }

  static enter({node, spec, clauseStack}: Context) {
    const clause = clauseStack[clauseStack.length - 1];
    const namespace = clause ? clause.namespace : spec.namespace;
    const prodref = new ProdRef(spec, node, namespace);
    spec._prodRefs.push(prodref);
  }

  build() {
    const entry = this.spec.biblio.byProductionName(this.name, this.namespace);
    const prod = entry ? entry._instance : null;

    let copy: HTMLElement;

    if (!prod) {
      console.error('Could not find production named ' + this.node.getAttribute('name'));
      return;
    }

    if (shouldInline(this.node)) {
      const cls = this.node.getAttribute('class') || '';

      if (cls.indexOf('inline') === -1) {
        this.node.setAttribute('class', cls + ' inline');
      }
    }

    if (this.node.hasAttribute('a')) {
      this.node.setAttribute('collapsed', '');
      if (!prod.rhsesById[this.node.getAttribute('a')!]) {
        console.error('Could not find alternative ' + this.node.getAttribute('a') + ' of production ' + prod.name);
        return;
      }

      copy = prod.node.cloneNode(false) as HTMLElement;

      // copy nodes until the first RHS. This captures the production name and any annotations.
      for (let j = 0; j < prod.node.childNodes.length; j++) {
        if (prod.node.childNodes[j].nodeName === 'EMU-RHS') break;

        copy.appendChild(prod.node.childNodes[j].cloneNode(true));
      }

      copy.appendChild(prod.rhsesById[this.node.getAttribute('a')!].node.cloneNode(true));
    } else {
      copy = prod.node.cloneNode(true) as HTMLElement;
    }

    copy.removeAttribute('id');
    
    if (this.node.parentNode) {
      this.node.parentNode.replaceChild(copy, this.node);
    }

    // copy attributes over (especially important for 'class').
    for (let j = 0; j < this.node.attributes.length; j++) {
      const attr = this.node.attributes[j];

      if (!copy.hasAttribute(attr.name)) {
        copy.setAttribute(attr.name, attr.value);
      }
    }

  }
}