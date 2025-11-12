/**
 * Some notes:
 * - Prince cant grok trailing commas, so prettier is disabled anywhere it tries to enforce wrapping with trailing comma
 * - Prince doesn't support template strings yet
 * - Set Prince.trackboxes to true for advanced debugging, see https://www.princexml.com/doc/cookbook/#how-and-where-is-my-box
 * */

/* eslint-disable no-undef */
'use strict';

// Prince.trackBoxes = true;

const shortname = document.querySelector('h1.shortname');
const version = document.querySelector('h1.version');
const title = document.querySelector('h1.title');

shortname.innerHTML = restoreSuperScripts(shortname.innerHTML);
version.innerHTML = restoreSuperScripts(version.innerHTML);
title.innerHTML = restoreSuperScripts(title.innerHTML);

rearrangeTables();

PDF.pageLayout = 'two-column-right';
PDF.pageMode = 'show-bookmarks';
PDF.duplex = 'duplex-flip-long-edge';
PDF.title = document.title;
PDF.author = 'Ecma International';
PDF.subject = shortname.innerHTML + (version ? ', ' + version.innerHTML : '');

/**
 * Terms and definitions section should not have every term listed in the table of contents.
 * */
const terms = document.querySelector('#toc a[href="#sec-terms-and-definitions"]');

if (terms) {
  (terms.parentElement.querySelector('ol.toc') || document.createElement('i')).remove();
}

function restoreSuperScripts(string) {
  if (!string) return false;

  return string
    .replace(/(\d)st/, '$1<sup>st</sup>')
    .replace(/(\d)nd/, '$1<sup>nd</sup>')
    .replace(/(\d)rd/, '$1<sup>rd</sup>')
    .replace(/(\d)th/, '$1<sup>th</sup>')
    .replace('&reg;', '<sup>&reg;</sup>')
    .replace('®', '<sup>®</sup>')
    .replace('&trade;', '<sup>&trade;</sup>')
    .replace('™', '<sup>™</sup>');
}

/**
 * Sets up table captions and figcaptions for tables, which provides for
 * continuation table captions.
 * */
function rearrangeTables() {
  const tables = Array.from(document.getElementsByTagName('emu-table'));

  tables.forEach(emuTable => {
    const figcaption = emuTable.getElementsByTagName('figcaption')[0];
    const tableCaptionText = figcaption.innerHTML;
    const table = emuTable.getElementsByTagName('table')[0];
    const captionElement = document.createElement('caption');

    captionElement.innerHTML = tableCaptionText;

    table.insertBefore(captionElement, table.getElementsByTagName('thead')[0]);
    table.appendChild(figcaption);
  });
}

/**
 * @typedef {Object} PrinceBox
 * @property {string} type
 * @property {number} pageNum
 * @property {number} x
 * @property {number} y
 * @property {number} w
 * @property {number} h
 * @property {number} baseline
 * @property {number} marginTop
 * @property {number} marginBottom
 * @property {number} marginLeft
 * @property {number} marginRight
 * @property {number} paddingTop
 * @property {number} paddingBottom
 * @property {number} paddingLeft
 * @property {number} paddingRight
 * @property {number} borderTop
 * @property {number} borderBottom
 * @property {number} borderLeft
 * @property {number} borderRight
 * @property {string} floatPosition "TOP" or "BOTTOM"
 * @property {PrinceBox[]} children
 * @property {PrinceBox} parent
 * @property {Element|null} element
 * @property {string|null} pseudo
 * @property {string} text
 * @property {string} src
 * @property {CSSStyleSheet} style
 * */
