import Spec from './Spec';
import Production from './Production';
import Builder from './Builder';

/*@internal*/
export default class RHS extends Builder {
  production: Production;
  constraints: string | null;
  alternativeId: string | null;

  constructor(spec: Spec, prod: Production, node: HTMLElement) {
    super(spec, node);
    this.production = prod;
    this.node = node;
    this.constraints = node.getAttribute('constraints');
    this.alternativeId = node.getAttribute('a');
  }

  build() {
    if (this.node.textContent === '') {
      this.node.textContent = '[empty]';

      return;
    }

    if (this.constraints) {
      const cs = this.spec.doc.createElement('emu-constraints');
      cs.textContent = '[' + this.constraints + ']';

      this.node.insertBefore(cs, this.node.childNodes[0]);
    }

    this.terminalify(this.node);
  }

  terminalify(parentNode: Element) {
    for (let i = 0; i < parentNode.childNodes.length; i++) {
      const node = parentNode.childNodes[i];

      if (node.nodeType === 3) {
        const text = node.textContent!.trim();
        const pieces = text.split(/\s/);

        pieces.forEach(p => {
          if (p.length === 0) {
            return;
          }
          const est = this.spec.doc.createElement('emu-t');
          est.textContent = p;

          parentNode.insertBefore(est, node);
        });

        parentNode.removeChild(node);
      }
    }
  }
}