import Builder from './Builder';
import type Spec from './Spec';
import type Production from './Production';

/*@internal*/
export default class GrammarAnnotation extends Builder {
  production: Production;

  constructor(spec: Spec, prod: Production, node: HTMLElement) {
    super(spec, node);
    this.production = prod;
  }

  build() {
    if (!this.node.firstChild) return;
    
    if (this.node.firstChild.nodeType === 3) {
      this.node.firstChild.textContent = '[' + this.node.firstChild.textContent;
    } else {
      const pre = this.spec.doc.createTextNode('[');
      this.node.insertBefore(pre, this.node.children[0]);
    }

    const post = this.spec.doc.createTextNode(']');
    this.node.appendChild(post);
  }
}
