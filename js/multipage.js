'use strict';

// Duplicates menu.js for fault tolerance.
function parseSpecPath(url) {
  let pathParts = url.pathname.split('/');
  let partCount = pathParts.length;
  let isMultipage = pathParts[partCount - 2] === 'multipage';
  let section = isMultipage ? pathParts[partCount - 1].replace(/\.html$/, '') : undefined;
  let pathPrefixEnd = isMultipage ? -2 : pathParts.findLastIndex(part => part !== '') + 1;
  let pathPrefix = pathParts.slice(0, pathPrefixEnd).join('/') + '/';
  return { pathParts, pathPrefix, isMultipage, section };
}

let idToSection = Object.create(null);
for (let [section, ids] of Object.entries(multipageMap)) {
  for (let id of ids) {
    if (!idToSection[id]) {
      idToSection[id] = section;
    }
  }
}

// Multipage preferences apply separately to each document, but are stored in a
// single { [pathPrefix]: { preference: boolean, lastUsed: <ms epoch> } } object.
const MULTIPAGE_PREFERENCE_STORAGE_KEY = 'multipagePreference';
// Forget a document's preference if it hasn't been visited in this long, so that
// the unique-per-PR paths used by preview deployments don't grow localStorage
// without bound.
const MULTIPAGE_PREFERENCE_TTL_MS = 180 * 24 * 60 * 60 * 1000; // 180 days
// For styling, the document element exposes the current preference and buttons
// for updating it expose their associated value (cf. css/elements.css).
const MULTIPAGE_PREFERENCE_ATTR = 'data-multipage-preference';
const SET_MULTIPAGE_PREFERENCE_ATTR = 'data-set-multipage-preference';

function parseMultipagePreferences(storage) {
  try {
    let raw = storage[MULTIPAGE_PREFERENCE_STORAGE_KEY];
    let preferencesByPathPrefix = JSON.parse(raw);
    let now = Date.now();
    for (let pathPrefix of Object.keys(preferencesByPathPrefix)) {
      let entry = preferencesByPathPrefix[pathPrefix];
      if (
        !entry ||
        typeof entry.lastUsed !== 'number' ||
        now - entry.lastUsed > MULTIPAGE_PREFERENCE_TTL_MS
      ) {
        delete preferencesByPathPrefix[pathPrefix];
      }
    }
    return preferencesByPathPrefix;
  } catch (e) {
    return undefined;
  }
}

function getMultipagePreference(storage) {
  let preferencesByPathPrefix = parseMultipagePreferences(storage) || {};

  // For PR previews, default to parent prefixes.
  let { pathPrefix } = parseSpecPath(location);
  while (pathPrefix) {
    let entry = preferencesByPathPrefix[pathPrefix];
    if (entry) {
      entry.lastUsed = Date.now();
      return entry.preference;
    }
    pathPrefix = pathPrefix.replace(/[^/]*\/$/, '');
  }

  return '';
}

function setMultipagePreference(storage, preference, skipNavigation) {
  let preferencesByPathPrefix = parseMultipagePreferences(storage) || {};
  let oldPreference = getMultipagePreference(storage);

  let { pathPrefix, isMultipage } = parseSpecPath(location);
  preferencesByPathPrefix[pathPrefix] = { preference, lastUsed: Date.now() };
  try {
    storage[MULTIPAGE_PREFERENCE_STORAGE_KEY] = JSON.stringify(preferencesByPathPrefix);
  } catch (e) {
    // storage may be full or unavailable.
  }

  if (skipNavigation || preference === oldPreference) return;
  if (preference === (isMultipage ? 'single-page' : 'multi-page')) {
    toggleMultipage();
  }
}

function toggleMultipage() {
  let { pathPrefix, isMultipage, section: activeSec } = parseSpecPath(location);
  let activeSecHash =
    activeSec && idToSection['sec-' + activeSec] != null ? '#sec-' + activeSec : undefined;
  let hash = location.hash;

  if (isMultipage) {
    location = pathPrefix + (hash || activeSecHash || '');
  } else {
    let targetSec = hash ? idToSection[hash.substring(1)] : undefined;
    location = pathPrefix + 'multipage/' + (targetSec ? targetSec + '.html' : '') + hash;
  }
}

// redirect to single-page/multi-page per preference
(() => {
  let { pathPrefix, isMultipage, section: activeSec } = parseSpecPath(location);
  let activeSecHash =
    activeSec && idToSection['sec-' + activeSec] != null ? '#sec-' + activeSec : undefined;
  let hash = location.hash;
  let resolvedHash = hash || activeSecHash || '';
  let targetSec = resolvedHash ? idToSection[resolvedHash.substring(1)] : undefined;

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

  let storage = window.localStorage || Object.create(null);
  let multipagePreference = getMultipagePreference(storage);
  if (isMultipage && multipagePreference === 'single-page') {
    window.navigating = true;
    location = pathPrefix + resolvedHash;
  } else if (
    isMultipage
      ? targetSec != null && (activeSec || 'index') !== targetSec
      : multipagePreference === 'multi-page'
  ) {
    window.navigating = true;
    location = pathPrefix + 'multipage/' + (targetSec ? targetSec + '.html' : '') + location.hash;
  }
})();

// enable preference togglers
document.documentElement.setAttribute(
  MULTIPAGE_PREFERENCE_ATTR,
  getMultipagePreference(window.localStorage),
);
if (window.localStorage) {
  let storage = window.localStorage;
  let enableToggles = container => {
    container.addEventListener('click', e => {
      let target = e.target.closest?.(`[${SET_MULTIPAGE_PREFERENCE_ATTR}]`);
      let preference = target?.getAttribute(SET_MULTIPAGE_PREFERENCE_ATTR);
      if (typeof preference !== 'string') {
        return;
      }
      document.documentElement.setAttribute(MULTIPAGE_PREFERENCE_ATTR, preference);
      setMultipagePreference(storage, preference);
    });
    // Work around a bug where contents are sometimes empty.
    setTimeout(() => {
      for (let el of container.querySelectorAll(`[${SET_MULTIPAGE_PREFERENCE_ATTR}]`)) {
        el.disabled = false;
      }
    }, 0);
  };

  let shortcuts = document.getElementById('shortcuts-help');
  if (shortcuts) {
    enableToggles(shortcuts);
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      shortcuts = document.getElementById('shortcuts-help');
      if (shortcuts) enableToggles(shortcuts);
    });
  }
}
