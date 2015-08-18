'use strict';

const Builder = require('./Builder');
const emd = require('ecmarkdown');

module.exports = class Toc extends Builder {
  build() {
    if (this.spec.subclauses.length === 0) {
      return;
    }

    const html = buildToc(this.spec);
    const tocContainer = this.spec.doc.createElement('div');
    tocContainer.innerHTML = '<h2>Table of Contents</h2>' + html;
    const intro = this.spec.doc.querySelector('emu-intro, emu-clause, emu-annex');
    intro.parentNode.insertBefore(tocContainer, intro);
  }
};

function buildToc(spec, level) {
  level = level || spec;

  let html = '<ol class="toc">';

  level.subclauses.forEach(function (sub) {
    html += '<li><a href="#' + sub.id + '"><span class="secnum">' + sub.number + '</span> ' + emd.fragment(sub.title) + '</a>';
    if (sub.subclauses.length > 0) html += buildToc(spec, sub);
    html += '</li>';
  });

  html += '</ol>';

  return html;
}
