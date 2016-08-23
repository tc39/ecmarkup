import Builder = require('./Builder');
import Spec = require('./Spec');
import Production = require('./Production');

/*@internal*/
class GrammarAnnotation extends Builder {
  production: Production;

  constructor(spec: Spec, prod: Production, node: HTMLElement) {
    super(spec, node);
    this.production = prod;
  }

  build() {
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

/*@internal*/
export = GrammarAnnotation;