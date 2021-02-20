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
      location = targetSec + '.html' + location.hash;
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  if (window.sessionStorage && sessionStorage.referencePaneState != null) {
    let state = JSON.parse(sessionStorage.referencePaneState);
    if (state == null) {
      return;
    }
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
    window.sessionStorage.referencePaneState = null;
  }
});

window.addEventListener('unload', () => {
  if (window.sessionStorage) {
    sessionStorage.referencePaneState = JSON.stringify(referencePane.state || null);
  }
});
