'use strict';

function parseSpecPath(url) {
  let pathParts = url.pathname.split('/');
  let partCount = pathParts.length;
  let isMultipage = pathParts[partCount - 2] === 'multipage';
  let section = isMultipage ? pathParts[partCount - 1].replace(/\.html$/, '') : undefined;
  let pathPrefixEnd = isMultipage ? -2 : pathParts.findLastIndex(part => part !== '') + 1;
  let pathPrefix = pathParts.slice(0, pathPrefixEnd).join('/');
  return { pathParts, pathPrefix, isMultipage, section };
};

// initialize globals
let idToSection = Object.create(null);
for (let [section, ids] of Object.entries(multipageMap)) {
  for (let id of ids) {
    if (!idToSection[id]) {
      idToSection[id] = section;
    }
  }
}
let { pathPrefix, isMultipage, section: activeSec } = parseSpecPath(location);
let activeSecHash =
  activeSec && idToSection['sec-' + activeSec] != null ? '#sec-' + activeSec : undefined;
let storage = window.localStorage || Object.create(null);
let toggleMultipage = () => {
  let hash = location.hash;
  if (isMultipage) {
    location = pathPrefix + '/' + (hash || activeSecHash || '');
  } else {
    let targetSec = hash ? idToSection[hash.substring(1)] : undefined;
    location = 'multipage/' + (targetSec ? targetSec + '.html' : '') + hash;
  }
};

// redirect to single-page/multi-page per preference
(() => {
  // ...except from internal links
  let referrer;
  try {
    referrer = new URL(document.referrer);
  } catch (_err) {
    // ignore
  }
  if (referrer && referrer.host === location.host) {
    if (parseSpecPath(referrer).pathPrefix === pathPrefix) return;
  }

  let resolvedHash = location.hash || activeSecHash || '';
  let targetSec = resolvedHash ? idToSection[resolvedHash.substring(1)] : undefined;
  let multipagePreference = storage.multipagePreference;
  if (isMultipage && multipagePreference === 'single-page') {
    window.navigating = true;
    location = pathPrefix + '/' + resolvedHash;
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
if (window.localStorage) {
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
