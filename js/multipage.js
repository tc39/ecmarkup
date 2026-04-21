'use strict';

// initialize globals
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
let toggleMultipage = () => {
  let hash = location.hash;
  if (isMultipage) {
    location = pathParts.slice(0, -2).join('/') + '/' + (hash || activeSecHash || '');
  } else {
    let targetSec = hash ? idToSection[hash.substring(1)] : undefined;
    location = 'multipage/' + (targetSec ? targetSec + '.html' : '') + hash;
  }
};

// redirect to single-page/multi-page per preference, except from internal links
(() => {
  let referrer;
  try {
    referrer = new URL(document.referrer);
  } catch (_err) {
    // ignore
  }
  if (referrer) {
    let referrerPathParts = referrer.pathname.split('/');
    let referrerPathPrefixEnd =
      referrerPathParts[referrerPathParts.length - 2] === 'multipage'
        ? -2
        : referrerPathParts.findLastIndex(part => part !== '') + 1;
    let referrerPathPrefix = referrerPathParts.slice(0, referrerPathPrefixEnd).join('/');
    let pathPrefixEnd = isMultipage ? -2 : pathParts.findLastIndex(part => part !== '') + 1;
    let pathPrefix = pathParts.slice(0, pathPrefixEnd).join('/');
    if (referrer.host === location.host && referrerPathPrefix === pathPrefix) {
      return;
    }
  }
  let resolvedHash = location.hash || activeSecHash || '';
  let targetSec = resolvedHash ? idToSection[resolvedHash.substring(1)] : undefined;
  let multipagePreference = storage.multipagePreference;
  if (isMultipage && multipagePreference === 'single-page') {
    window.navigating = true;
    location = pathParts.slice(0, -2).join('/') + '/' + resolvedHash;
  } else if (
    isMultipage
      ? targetSec != null && (activeSec || 'index') !== targetSec
      : multipagePreference === 'multi-page'
  ) {
    window.navigating = true;
    location = 'multipage/' + (targetSec ? targetSec + '.html' : '') + location.hash;
  }
})();

// enable preference togglers
document.documentElement.dataset.multipagePreference = storage.multipagePreference || '';
if (typeof localStorage !== 'undefined') {
  let enableToggles = () => {
    for (let el of document.querySelectorAll('[disabled][data-multipage-preference]')) {
      el.disabled = false;
    }
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', enableToggles);
  } else {
    enableToggles();
  }
  document.addEventListener('click', e => {
    if (!(e.target instanceof HTMLElement)) {
      return;
    }
    let target = e.target;
    let toggler = target.closest('[data-multipage-preference]');
    if (target.isContentEditable || !toggler || toggler === document.documentElement) {
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
    let multipagePreference = toggler.dataset.multipagePreference;
    if (multipagePreference !== (storage.multipagePreference || '')) {
      storage.multipagePreference = multipagePreference;
      document.documentElement.dataset.multipagePreference = multipagePreference;
      if (multipagePreference === (isMultipage ? 'single-page' : 'multi-page')) {
        toggleMultipage();
      }
    }
    e.preventDefault();
  });
}
