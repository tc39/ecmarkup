import Builder = require('./Builder');
import Spec = require("./Spec");
import Clause = require("./Clause");

/*@internal*/
class Example extends Builder {
  clause: Clause;
  caption: string | null;
  id: string | undefined;

  constructor(spec: Spec, node: HTMLElement, clause: Clause) {
    super(spec, node);
    this.clause = clause;
    this.caption = this.node.getAttribute('caption');
    if (this.node.hasAttribute('id')) {
      this.id = this.node.getAttribute('id')!;
    }
  }

  build(number?: number) {
    if (this.id) {
      // biblio is added during the build step as we don't know
      // the number at build time. Could probably be fixed.
      this.spec.biblio.add({
        type: 'example',
        id: this.id,
        number: number || 1,
        clauseId: this.clause.id
      });
    }

    this.node.innerHTML = '<figure>' + this.node.innerHTML + '</figure>';

    let caption = 'Example';
    if (number) {
      caption += ' ' + number;
    }

    caption += ' (Informative)';

    if (this.caption) {
      caption += ': ' + this.caption;
    }

    const captionElem = this.spec.doc.createElement('figcaption');
    captionElem.textContent = caption;
    this.node.childNodes[0].insertBefore(captionElem, this.node.childNodes[0].firstChild);
  }
}

/*@internal*/
export = Example;