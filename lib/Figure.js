'use strict';
const Builder = require('./Builder');

module.exports = class Figure extends Builder {
  constructor(spec, node) {
    super(spec, node);
    this.type = node.nodeName.split('-')[1].toLowerCase();
    this.number = ++spec._figureCounts[this.type];
    this.id = node.getAttribute('id');

    if (this.id) {
      spec.biblio[this.type + 's'][this.id] = {
        location: '',
        id: this.id,
        number: this.number
      };
    }
    this.isInformative = node.hasAttribute('informative');
    this.caption = node.getAttribute('caption');
  }

  build() {
    this.node.innerHTML = '<figure>' + this.node.innerHTML + '</figure>';

    let caption = this.type.charAt(0).toUpperCase() + this.type.slice(1);
    caption += ' ' + this.number;

    if (this.isInformative) {
      caption += ' (Informative)';
    }

    if (this.caption) {
      caption += ': ' + this.caption;
    }

    const captionElem = this.spec.doc.createElement('figcaption');
    captionElem.textContent = caption;
    this.node.childNodes[0].insertBefore(captionElem, this.node.childNodes[0].firstChild);
  }
};
