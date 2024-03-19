import type Spec from './Spec';
import type Clause from './Clause';

/*@internal*/
export default class Toc {
  spec: Spec;
  constructor(spec: Spec) {
    this.spec = spec;
  }

  build(maxDepth: number = Infinity) {
    if (this.spec.subclauses.length === 0) {
      return;
    }

    const html = Toc.build(this.spec, { maxDepth });
    const tocContainer = this.spec.doc.createElement('div');
    tocContainer.setAttribute('id', 'toc');
    tocContainer.innerHTML = '<h2>Table of Contents</h2>' + html;
    const intro = this.spec.doc.querySelector('emu-intro, emu-clause, emu-annex');
    if (intro && intro.parentNode) {
      intro.parentNode.insertBefore(tocContainer, intro);
    }

    const bodyClass = this.spec.doc.body.getAttribute('class') || '';
    this.spec.doc.body.setAttribute('class', bodyClass + ' oldtoc');
  }

  static build(level: Spec | Clause, options: { maxDepth?: number, expandy?: boolean } = {}) {
    let maxDepth = options.maxDepth ?? Infinity;
    if (maxDepth <= 0) {
      return '';
    }

    let expandy = options.expandy ?? false;

    let html = '<ol class="toc">';

    level.subclauses.forEach(sub => {
      html += '<li>';

      if (expandy) {
        if (sub.subclauses.length > 0) {
          html += '<span class="item-toggle">+</span>';
        } else {
          html += '<span class="item-toggle-none"></span>';
        }
      }

      html += '<a href="#' + sub.id + '" title="' + sub.title + '">';
      if (sub.number) {
        html += '<span class="secnum">' + sub.number + '</span> ';
      }
      html += shorten(sub.titleHTML) + '</a>';
      if (sub.subclauses.length > 0) html += Toc.build(sub, Object.assign({}, options, { maxDepth: maxDepth - 1 }));
      html += '</li>';
    });

    html += '</ol>';

    return html;
  }
}

function shorten(title: string) {
  return title.replace('Static Semantics:', 'SS:').replace('Runtime Semantics:', 'RS:');
}
