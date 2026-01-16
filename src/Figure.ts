import type Spec from './Spec';
import type { Context } from './Context';

import Builder from './Builder';

export default class Figure extends Builder {
  type: string;
  number: number;
  id: string | null;
  isInformative: boolean;
  captionElem: HTMLElement | null;
  caption: string;

  static elements = ['EMU-FIGURE'];

  constructor(spec: Spec, node: HTMLElement) {
    super(spec, node);
    this.type = node.nodeName.split('-')[1].toLowerCase();
    this.number = ++spec._figureCounts[this.type];
    this.id = node.getAttribute('id');

    this.isInformative = node.hasAttribute('informative');
    this.captionElem = node.querySelector('emu-caption');
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
      spec.biblio.add({
        type: this.type as 'table' | 'figure' | 'example' | 'note',
        id: this.id,
        number: this.number,
        caption: this.caption,
      });
    }
  }

  static async enter({ spec, node }: Context) {
    const figure = new Figure(spec, node);
    Figure.injectFigureElement(spec, node, figure);
  }

  static injectFigureElement(spec: Spec, node: HTMLElement, figure: Figure) {
    if (figure.captionElem && figure.captionElem.parentNode) {
      figure.captionElem.parentNode.removeChild(figure.captionElem);
    }

    const ele = spec.doc.createElement('figure');

    ele.append(...node.childNodes);
    node.append(ele);

    const captionElem = spec.doc.createElement('figcaption');
    captionElem.innerHTML = figure.caption;
    node.childNodes[0].insertBefore(captionElem, node.childNodes[0].firstChild);
  }
}
