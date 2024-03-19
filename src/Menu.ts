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
  const unpinAll = spec.doc.createElement('button');
  unpinAll.setAttribute('class', 'unpin-all');
  unpinAll.textContent = 'clear';
  pinHeader.appendChild(unpinAll);

  const pinList = spec.doc.createElement('ul');
  pinList.setAttribute('id', 'menu-pins-list');

  pinContainer.appendChild(pinHeader);
  pinContainer.appendChild(pinList);

  const toc = Toc.build(spec, { expandy: true });

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
  menuSpacer.classList.add('menu-spacer');

  const menuToggle = spec.doc.createElement('div');
  menuToggle.setAttribute('id', 'menu-toggle');
  menuToggle.innerHTML =
    // a square "hamburger" menu symbol consisting of three horizontal lines,
    // similar in appearance to U+2630 TRIGRAM FOR HEAVEN ☰
    `<svg xmlns="http://www.w3.org/2000/svg"
        style="width:100%; height:100%; stroke:currentColor"
        viewBox="0 0 120 120"
        width=54 height=54>
      <title>Menu</title>
      <path stroke-width="10" stroke-linecap="round" d="M30,60 h60  M30,30 m0,5 h60  M30,90 m0,-5 h60" />
    </svg>`;

  const json = JSON.stringify(
    { refsByClause: spec.refsByClause, entries: spec.biblio.localEntries() },
    biblioReplacer,
  );

  return {
    eles: [menuContainer, menuSpacer, menuToggle],
    js: `let biblio = JSON.parse(\`${json.replace(/[\\`$]/g, '\\$&')}\`);`,
  };
}

const INCLUDED_KEYS = new Set([
  'type',
  'id',
  'refId',
  'aoid',
  'title',
  'titleHTML',
  'number',
  'name',
  'term',
  'caption',
  'referencingIds',
]);
function biblioReplacer(this: BiblioEntry, k: string, v: unknown) {
  if (!{}.hasOwnProperty.call(this, 'type')) {
    // for non-BiblioEntry items
    return v;
  }
  if (k === 'referencingIds' && (v as string[]).length === 0) {
    return undefined;
  }
  if (k === 'aoid' && this.type !== 'op') {
    // aoid is only used as a key for 'op's, nothing else
    return undefined;
  }
  if (k === 'title') {
    if (this.type === 'clause' && this.title !== this.titleHTML) {
      return v;
    }
    return undefined;
  }
  return INCLUDED_KEYS.has(k) ? v : undefined;
}
