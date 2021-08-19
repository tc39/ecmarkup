import type { BiblioEntry } from './Biblio';
import type Spec from './Spec';

import Toc from './Toc';

/*@internal*/
export default function makeMenu(spec: Spec) {
  const pinContainer = spec.doc.createElement('div');
  pinContainer.setAttribute('id', 'menu-pins');
  const pinHeader = spec.doc.createElement('div');
  pinHeader.textContent = 'Pins';
  pinHeader.setAttribute('class', 'menu-pane-header');
  const pinList = spec.doc.createElement('ul');
  pinList.setAttribute('id', 'menu-pins-list');

  pinContainer.appendChild(pinHeader);
  pinContainer.appendChild(pinList);

  const toc = Toc.build(spec, true);

  const tocContainer = spec.doc.createElement('div');
  tocContainer.setAttribute('id', 'menu-toc');
  tocContainer.innerHTML = toc;

  const tocHeader = spec.doc.createElement('div');
  tocHeader.textContent = 'Table of Contents';
  tocHeader.setAttribute('class', 'menu-pane-header');
  tocContainer.appendChild(tocHeader);

  const searchContainer = spec.doc.createElement('div');
  searchContainer.setAttribute('id', 'menu-search');
  searchContainer.innerHTML =
    '<input type=text id=menu-search-box placeholder=Search...><div id=menu-search-results class=inactive></div>';

  const menuContainer = spec.doc.createElement('div');
  menuContainer.setAttribute('id', 'menu');
  menuContainer.appendChild(searchContainer);
  menuContainer.appendChild(pinContainer);
  menuContainer.appendChild(tocHeader);
  menuContainer.appendChild(tocContainer);

  const menuSpacer = spec.doc.createElement('div');
  menuSpacer.setAttribute('id', 'menu-spacer');

  const menuToggle = spec.doc.createElement('div');
  menuToggle.setAttribute('id', 'menu-toggle');
  menuToggle.textContent = '☰';

  const json = JSON.stringify(
    { refsByClause: spec.refsByClause, entries: spec.biblio.toJSON() },
    biblioReplacer
  );

  return {
    eles: [menuContainer, menuSpacer, menuToggle],
    js: `let biblio = JSON.parse(\`${json.replace(/[\\`$]/g, '\\$&')}\`);`,
  };
}

function biblioReplacer(this: BiblioEntry, k: string, v: unknown) {
  if (!['title', 'namespace', 'location'].includes(k)) {
    return v;
  }
  if (k === 'title' && this.type === 'clause' && this.title !== this.titleHTML) {
    return v;
  }
  return undefined;
}
