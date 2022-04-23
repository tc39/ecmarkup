'use strict';
let idToSection = Object.create(null);
for (let [section, ids] of Object.entries(multipageMap)) {
  for (let id of ids) {
    if (!idToSection[id]) {
      idToSection[id] = section;
    }
  }
}
if (location.hash) {
  let targetSec = idToSection[location.hash.substring(1)];
  if (targetSec != null) {
    let match = location.pathname.match(/([^/]+)\.html?$/);
    if ((match != null && match[1] !== targetSec) || location.pathname.endsWith('/multipage/')) {
      location = (targetSec === 'index' ? './' : targetSec + '.html') + location.hash;
    }
  }
}

function getTocPath(li) {
  let path = [];
  let pointer = li;
  while (true) {
    let parent = pointer.parentElement;
    if (parent == null) {
      return null;
    }
    let index = [].indexOf.call(parent.children, pointer);
    if (index == -1) {
      return null;
    }
    path.unshift(index);
    pointer = parent.parentElement;
    if (pointer == null) {
      return null;
    }
    if (pointer.id === 'menu-toc') {
      break;
    }
    if (pointer.tagName !== 'LI') {
      return null;
    }
  }
  return path;
}

function activateTocPath(path) {
  try {
    let pointer = document.getElementById('menu-toc');
    for (let index of path) {
      pointer = pointer.querySelector('ol').children[index];
    }
    pointer.classList.add('active');
  } catch (e) {
    // pass
  }
}

function getActiveTocPaths() {
  return [...menu.$menu.querySelectorAll('.active')].map(getTocPath).filter(p => p != null);
}

function loadStateFromSessionStorage() {
  if (!window.sessionStorage) {
    return;
  }
  if (sessionStorage.referencePaneState != null) {
    let state = JSON.parse(sessionStorage.referencePaneState);
    if (state != null) {
      if (state.type === 'ref') {
        let entry = menu.search.biblio.byId[state.id];
        if (entry != null) {
          referencePane.showReferencesFor(entry);
        }
      } else if (state.type === 'sdo') {
        let sdos = sdoMap[state.id];
        if (sdos != null) {
          referencePane.$headerText.innerHTML = state.html;
          referencePane.showSDOsBody(sdos, state.id);
        }
      }
      delete sessionStorage.referencePaneState;
    }
  }

  if (sessionStorage.activeTocPaths != null) {
    document
      .getElementById('menu-toc')
      .querySelectorAll('.active')
      .forEach(e => {
        e.classList.remove('active');
      });
    let active = JSON.parse(sessionStorage.activeTocPaths);
    active.forEach(activateTocPath);
    delete sessionStorage.activeTocPaths;
  }

  console.log({ sv: sessionStorage.searchValue });
  if (sessionStorage.searchValue != null) {
    let value = JSON.parse(sessionStorage.searchValue);
    menu.search.$searchBox.value = value;
    menu.search.search(value)
    delete sessionStorage.searchValue;
  }
  console.log('clearing');

  if (sessionStorage.tocScroll != null) {
    let tocScroll = JSON.parse(sessionStorage.tocScroll);
    menu.$toc.scrollTop = tocScroll;
    delete sessionStorage.tocScroll;
  }

}

document.addEventListener('DOMContentLoaded', loadStateFromSessionStorage);

window.addEventListener('pageshow', loadStateFromSessionStorage);

window.addEventListener('beforeunload', () => {
  if (window.sessionStorage) {
    sessionStorage.referencePaneState = JSON.stringify(referencePane.state || null);
    sessionStorage.activeTocPaths = JSON.stringify(getActiveTocPaths());
    sessionStorage.searchValue = JSON.stringify(menu.search.$searchBox.value);
    sessionStorage.tocScroll = JSON.stringify(menu.$toc.scrollTop);
  }
});
