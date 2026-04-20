'use strict';
let idToSection = Object.create(null);
for (let [section, ids] of Object.entries(multipageMap)) {
  for (let id of ids) {
    if (!idToSection[id]) {
      idToSection[id] = section;
    }
  }
}
let pathParts = location.pathname.split('/');
let isMultipage = pathParts[pathParts.length - 2] === 'multipage';
let activeSec = isMultipage ? pathParts[pathParts.length - 1].replace(/\.html$/, '') : undefined;
let activeSecHash =
  activeSec && idToSection['sec-' + activeSec] != null ? '#sec-' + activeSec : undefined;
let storage = typeof localStorage !== 'undefined' ? localStorage : Object.create(null);

{
  let resolvedHash = location.hash || activeSecHash || '';
  let targetSec = resolvedHash ? idToSection[resolvedHash.substring(1)] : undefined;
  let preferMultipage = storage.preferMultipage;
  if (isMultipage && preferMultipage === 'false') {
    window.navigating = true;
    location = pathParts.slice(0, -2).join('/') + '/' + resolvedHash;
  } else if (
    isMultipage
      ? targetSec != null && (activeSec || 'index') !== targetSec
      : preferMultipage === 'true'
  ) {
    window.navigating = true;
    location = 'multipage/' + targetSec + '.html' + location.hash;
  }
}
let maybeToggleMultipage = e => {
  if (!(e.target instanceof HTMLElement)) {
    return;
  }
  let target = e.target;
  let name = target.nodeName.toLowerCase();
  if (name === 'textarea' || name === 'input' || name === 'select' || target.isContentEditable) {
    return;
  }
  if (e.altKey || e.ctrlKey || e.metaKey || e.key !== 'm') {
    return;
  }
  let hash = location.hash;
  if (isMultipage) {
    storage.preferMultipage = 'false';
    location = pathParts.slice(0, -2).join('/') + '/' + (hash || activeSecHash || '');
  } else {
    storage.preferMultipage = 'true';
    let targetSec = hash ? idToSection[hash.substring(1)] : undefined;
    location = 'multipage/' + (targetSec ? targetSec + '.html' : '') + hash;
  }
};
document.addEventListener('keypress', maybeToggleMultipage);

let maybeSetMultipagePreference = e => {
  if (!(e.target instanceof HTMLElement)) {
    return;
  }
  let target = e.target;
  let toggler = target.closest('[data-prefer-multipage]');
  if (!toggler || target.isContentEditable) {
    return;
  }
  switch (target.nodeName.toLowerCase()) {
    case 'textarea':
    case 'select':
      return;
    case 'input': {
      let isCheckable = target.type === 'checkbox' || target.type === 'radio';
      if (toggler !== target || !isCheckable || !target.checked) {
        return;
      }
    }
  }
  storage.preferMultipage = toggler.dataset.preferMultipage;
};
document.addEventListener('click', maybeSetMultipagePreference);
