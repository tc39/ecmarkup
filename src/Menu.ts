import type Spec from './Spec';

import Toc from './Toc';

/*@internal*/
export default class Menu {
  spec: Spec;
  constructor(spec: Spec) {
    this.spec = spec;
  }

  build() {
    const pinContainer = this.spec.doc.createElement('div');
    pinContainer.setAttribute('id', 'menu-pins');
    const pinHeader = this.spec.doc.createElement('div');
    pinHeader.textContent = 'Pins';
    pinHeader.setAttribute('class', 'menu-pane-header');
    const pinList = this.spec.doc.createElement('ul');
    pinList.setAttribute('id', 'menu-pins-list');

    pinContainer.appendChild(pinHeader);
    pinContainer.appendChild(pinList);

    const toc = Toc.build(this.spec, true);

    const tocContainer = this.spec.doc.createElement('div');
    tocContainer.setAttribute('id', 'menu-toc');
    tocContainer.innerHTML = toc;

    const tocHeader = this.spec.doc.createElement('div');
    tocHeader.textContent = 'Table of Contents';
    tocHeader.setAttribute('class', 'menu-pane-header');
    tocContainer.appendChild(tocHeader);

    const searchContainer = this.spec.doc.createElement('div');
    searchContainer.setAttribute('id', 'menu-search');
    searchContainer.innerHTML =
      '<input type=text id=menu-search-box placeholder=Search...><div id=menu-search-results class=inactive></div>';

    const menuContainer = this.spec.doc.createElement('div');
    menuContainer.setAttribute('id', 'menu');
    menuContainer.appendChild(searchContainer);
    menuContainer.appendChild(pinContainer);
    menuContainer.appendChild(tocHeader);
    menuContainer.appendChild(tocContainer);
    this.spec.doc.body.insertBefore(menuContainer, this.spec.doc.body.firstChild);

    const menuSpacer = this.spec.doc.createElement('div');
    menuSpacer.setAttribute('id', 'menu-spacer');
    this.spec.doc.body.insertBefore(menuSpacer, this.spec.doc.body.firstChild);

    const menuToggle = this.spec.doc.createElement('div');
    menuToggle.setAttribute('id', 'menu-toggle');
    menuToggle.textContent = '☰';

    this.spec.doc.body.insertBefore(menuToggle, this.spec.doc.body.firstChild);

    const json = JSON.stringify(this.spec.biblio, (k, v) =>
      ['title', 'namespace', 'location'].includes(k) ? undefined : v
    );

    return `let biblio = JSON.parse(\`${json.replace(/[\\`$]/g, '\\$&')}\`);`;
  }
}
