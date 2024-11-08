/**
 * Some notes:
 * - Prince cant grok trailing commas, so prettier is disabled anywhere it tries to enforce wrapping with trailing comma
 * - Prince doesn't support template strings yet
 * - Set Prince.trackboxes to true for advanced debugging, see https://www.princexml.com/doc/cookbook/#how-and-where-is-my-box
 * */

/* eslint-disable no-undef */
'use strict';

// Prince.trackBoxes = true;

const specContainer = document.getElementById('spec-container');
const shortname = specContainer.querySelector('h1.shortname');
const version = specContainer.querySelector('h1.version');
const title = specContainer.querySelector('h1.title');
const year = version.getAttribute('data-year');

rearrangeTables();

PDF.pageLayout = 'two-column-right';
PDF.pageMode = 'show-bookmarks';
PDF.duplex = 'duplex-flip-long-edge';
PDF.title = document.title;
PDF.author = 'Ecma International';
PDF.subject = shortname.innerHTML + ', ' + version.innerHTML;

Prince.registerPostLayoutFunc(() => {
  specContainer.parentNode.insertBefore(generateFrontCover(), specContainer);
  specContainer.parentNode.insertBefore(generateInsideCover(), specContainer);

  /**
   * Specific modifications for Ecma standards that don't apply to other
   * usages of ecmarkup. In case idk a proposal has the need to publish a PDF.
   * */
  if (/ECMA-/.test(shortname.innerHTML)) {
    const metadataBlock = document.getElementById('metadata-block');
    const intro = document.getElementsByTagName('emu-intro')[0];
    const scope = document.getElementById('scope') || document.getElementById('sec-scope');

    intro.parentNode.insertBefore(generateEcmaCopyrightPage(), scope);
    intro.appendChild(metadataBlock);
    specContainer.insertBefore(title.cloneNode(true), scope);
  }
});

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

function generateFrontCover() {
  const frontCover = document.createElement('div');

  frontCover.classList.add('full-page-svg');
  frontCover.setAttribute('id', 'front-cover');

  frontCover.appendChild(shortname);
  frontCover.appendChild(version);
  frontCover.appendChild(title);

  return frontCover;
}

function generateInsideCover() {
  const insideCover = document.createElement('div');

  insideCover.classList.add('full-page-svg');
  insideCover.setAttribute('id', 'inside-cover');
  insideCover.innerHTML =
    '<p>Ecma International<br />Rue du Rhone 114 CH-1204 Geneva<br/>Tel: +41 22 849 6000<br/>Fax: +41 22 849 6001<br/>Web: https://www.ecma-international.org<br/>Ecma is the registered trademark of Ecma International.</p>';

  return insideCover;
}

function generateEcmaCopyrightPage() {
  const copyrightNotice = document.createElement('div');

  copyrightNotice.classList.add('copyright-notice');
  copyrightNotice.innerHTML =
    '<p>COPYRIGHT NOTICE</p>\n\n<p>© ' +
    year +
    ' Ecma International</p>\n\n<p>This document may be copied, published and distributed to others, and certain derivative works of it may be prepared, copied, published, and distributed, in whole or in part, provided that the above copyright notice and this Copyright License and Disclaimer are included on all such copies and derivative works. The only derivative works that are permissible under this Copyright License and Disclaimer are: </p>\n\n<p>(i) works which incorporate all or portion of this document for the purpose of providing commentary or explanation (such as an annotated version of the document),</p>\n\n<p>(ii) works which incorporate all or portion of this document for the purpose of incorporating features that provide accessibility,</p>\n\n<p>(iii) translations of this document into languages other than English and into different formats and</p>\n\n<p>(iv) works by making use of this specification in standard conformant products by implementing (e.g. by copy and paste wholly or partly) the functionality therein.</p>\n\n<p>However, the content of this document itself may not be modified in any way, including by removing the copyright notice or references to Ecma International, except as required to translate it into languages other than English or into a different format.</p>\n\n<p>The official version of an Ecma International document is the English language version on the Ecma International website. In the event of discrepancies between a translated version and the official version, the official version shall govern.</p>\n\n<p>The limited permissions granted above are perpetual and will not be revoked by Ecma International or its successors or assigns.</p>\n\n<p>This document and the information contained herein is provided on an &ldquo;AS IS&rdquo; basis and ECMA INTERNATIONAL DISCLAIMS ALL WARRANTIES, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO ANY WARRANTY THAT THE USE OF THE INFORMATION HEREIN WILL NOT INFRINGE ANY OWNERSHIP RIGHTS OR ANY IMPLIED WARRANTIES OF MERCHANTABILITY OR FITNESS FOR A PARTICULAR PURPOSE.</p>';

  return copyrightNotice;
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
