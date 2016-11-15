import Builder from './Builder';
import emd = require('ecmarkdown');
import Spec from './Spec';
import Clause from './Clause';

/*@internal*/
export default class Toc {
  spec: Spec;
  constructor(spec: Spec) {
    this.spec = spec;
  }

  build() {
    if (this.spec.subclauses.length === 0) {
      return;
    }

    const html = Toc.build(this.spec);
    const tocContainer = this.spec.doc.createElement('div');
    tocContainer.innerHTML = '<h2>Table of Contents</h2>' + html;
    const intro = this.spec.doc.querySelector('emu-intro, emu-clause, emu-annex');
    if (intro && intro.parentNode) {
      intro.parentNode.insertBefore(tocContainer, intro);
    }

    const bodyClass = this.spec.doc.body.getAttribute('class') || '';
    this.spec.doc.body.setAttribute('class', bodyClass + ' oldtoc');
  }

  static build(level: Spec | Clause, expandy?: boolean) {
    let html = '<ol class="toc">';

    level.subclauses.forEach(sub => {
      html += '<li>';

      if (expandy) {
        if (sub.subclauses.length > 0) {
          html += '<span class="item-toggle">◢</span>';
        } else {
          html += '<span class="item-toggle-none"></span>';
        }
      }

      html += '<a href="#' + sub.id + '" title="' + sub.title + '">';
      if (sub.number) {
        html += '<span class="secnum">' + sub.number + '</span> ';
      }
      html += shorten(sub.titleHTML) + '</a>';
      if (sub.subclauses.length > 0) html += Toc.build(sub, expandy);
      html += '</li>';
    });

    html += '</ol>';

    return html;
  }
};

function shorten(title: string) {
  return title.replace('Static Semantics:', 'SS:')
              .replace('Runtime Semantics:', 'RS:');
}