'use strict';
const parent = require('./utils').parent;
// Loosely based on https://resources.whatwg.org/dfn.js

module.exports = document => {
  let uniqueIdCounter = 0;
  const elementsWithIds = document.querySelectorAll('[id]');
  const links = document.querySelectorAll('a[href^="#"]');

  const idsToContainers = new Map();
  for (const element of elementsWithIds) {
    const utils = getUtils(element);
    if (!utils) {
      // For now we only do this for things with .utils descendants
      continue;
    }

    const container = document.createElement('aside');
    container.setAttribute('hidden', '');
    container.className = 'id-references';
    container.innerHTML = `<p><a href="#${element.id}">#${element.id}</a></p>`;

    const introP = document.createElement('p');
    introP.textContent = 'Referenced in:';
    container.appendChild(introP);

    utils.appendChild(container);

    idsToContainers.set(element.id, {
      container,
      introP,
      referenceList: null,
      lastCaption: null,
      lastLi: null,
      perCaptionCounter: null
    });
  }

  for (const link of links) {
    if (shouldIgnore(link)) {
      continue;
    }

    const id = link.getAttribute('href').substring(1);

    const entry = idsToContainers.get(id);
    if (!entry) {
      // A link to something without a .utils descendant
      continue;
    }

    if (!entry.referenceList) {
      entry.referenceList = document.createElement('ul');
      entry.container.appendChild(entry.referenceList);
    }

    const caption = getCaption(link);

    let linkId = link.id;
    if (!linkId) {
      linkId = link.id = 'reference-return-' + (++uniqueIdCounter);
    }
    const referenceLink = document.createElement('a');
    referenceLink.href = '#' + linkId;

    if (caption !== entry.lastCaption) {
      entry.lastCaption = caption;
      entry.perCaptionCounter = 1;

      copyContents({ from: caption, to: referenceLink });
      const li = entry.lastLi = document.createElement('li');
      li.appendChild(referenceLink);
      entry.referenceList.appendChild(li);
    } else {
      referenceLink.textContent = `(${++entry.perCaptionCounter})`;
      entry.lastLi.appendChild(document.createTextNode(' '));
      entry.lastLi.appendChild(referenceLink);
    }
  }

  for (const entry of idsToContainers.values()) {
    if (entry.referenceList === null) {
      entry.introP.textContent = 'No references in this file.';
    }
  }
};

function copyContents(options) {
  const cloneOfFrom = options.from.cloneNode(true);
  while (cloneOfFrom.hasChildNodes()) {
    const child = cloneOfFrom.removeChild(cloneOfFrom.firstChild);
    if (child.className !== 'utils') {
      options.to.appendChild(cloneOfFrom.firstChild);
    }
  }
}

function getCaption(link) {
  return parent(link, ['EMU-CLAUSE']).querySelector('h1');
}

function getUtils(element) {
  const utils = element.querySelector('.utils');
  if (!utils || !utils.querySelector('.anchor')) {
    return null;
  }

  return utils;
}

function shouldIgnore(link) {
  // Ignore anchor links
  if (link.className === 'anchor' && link.parentElement.className === 'utils') {
    return true;
  }

  return false;
}
