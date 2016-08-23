"use strict";
const Toc = require('./Toc');
/*@internal*/
class Menu {
    constructor(spec) {
        this.spec = spec;
    }
    build() {
        const toc = Toc.build(this.spec, true);
        const tocContainer = this.spec.doc.createElement('div');
        tocContainer.setAttribute('id', 'menu-toc');
        tocContainer.innerHTML = toc;
        const searchContainer = this.spec.doc.createElement('div');
        searchContainer.setAttribute('id', 'menu-search');
        searchContainer.innerHTML = '<input type=text id=menu-search-box placeholder=Search...><div id=menu-search-results class=inactive></div>';
        const menuContainer = this.spec.doc.createElement('div');
        menuContainer.setAttribute('id', 'menu');
        menuContainer.appendChild(searchContainer);
        menuContainer.appendChild(tocContainer);
        this.spec.doc.body.insertBefore(menuContainer, this.spec.doc.body.firstChild);
        const menuToggle = this.spec.doc.createElement('div');
        menuToggle.setAttribute('id', 'menu-toggle');
        menuToggle.textContent = '☰';
        this.spec.doc.body.insertBefore(menuToggle, this.spec.doc.body.firstChild);
        const biblioContainer = this.spec.doc.createElement('script');
        biblioContainer.setAttribute('type', 'application/json');
        biblioContainer.id = 'menu-search-biblio';
        biblioContainer.textContent = JSON.stringify(this.spec.biblio);
        this.spec.doc.head.appendChild(biblioContainer);
    }
}
module.exports = Menu;
//# sourceMappingURL=Menu.js.map