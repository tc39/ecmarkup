import Builder = require('./Builder');
import Spec = require('./Spec');
import Biblio = require('./Biblio');

/*@internal*/
class Figure extends Builder {
  type: string;
  number: number;
  id: string | null;
  isInformative: boolean;
  captionElem: HTMLElement | null;
  caption: string;

  constructor(spec: Spec, node: HTMLElement) {
    super(spec, node);
    this.type = node.nodeName.split('-')[1].toLowerCase();
    this.number = ++spec._figureCounts[this.type];
    this.id = node.getAttribute('id');

    this.isInformative = node.hasAttribute('informative');
    this.captionElem = node.querySelector('emu-caption') as HTMLElement | null;
    this.caption = this.type.charAt(0).toUpperCase() + this.type.slice(1) + ' ' + this.number;

    if (this.isInformative) {
      this.caption += ' (Informative)';
    }

    if (this.captionElem) {
      this.caption += ': ' + this.captionElem.innerHTML;
    } else if (node.getAttribute('caption')) {
      this.caption += ': ' + node.getAttribute('caption');
    }


    if (this.id) {
      spec.biblio.add(<Biblio.FigureBiblioEntry>{
        type: this.type as "table" | "figure" | "example" | "note",
        id: this.id,
        number: this.number,
        caption: this.caption
      });
    }
  }

  build() {
    if (this.captionElem) {
      this.captionElem.parentNode.removeChild(this.captionElem);
    }

    this.node.innerHTML = '<figure>' + this.node.innerHTML + '</figure>';

    const captionElem = this.spec.doc.createElement('figcaption');
    captionElem.innerHTML = this.caption;
    this.node.childNodes[0].insertBefore(captionElem, this.node.childNodes[0].firstChild);
  }
};

/*@internal*/
export = Figure;