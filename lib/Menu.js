'use strict';

const Builder = require('./Builder');
const Toc = require('./Toc');

module.exports = class Menu extends Builder {
  build() {
    const toc = Toc.build(this.spec, true);
    const tocContainer = this.spec.doc.createElement('div');
    tocContainer.setAttribute('id', 'menu-toc');
    tocContainer.innerHTML = toc;

    const menuContainer = this.spec.doc.createElement('div');
    menuContainer.setAttribute('id', 'menu');
    menuContainer.appendChild(tocContainer);

    this.spec.doc.body.insertBefore(menuContainer, this.spec.doc.body.firstChild);

    const menuToggle =  this.spec.doc.createElement('div');
    menuToggle.setAttribute('id', 'menu-toggle');
    menuToggle.textContent = '☰';

    this.spec.doc.body.insertBefore(menuToggle, this.spec.doc.body.firstChild);
  }
};
