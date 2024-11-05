import type Spec from './Spec';
import type Clause from './Clause';

export default class Toc {
  /** @internal */ spec: Spec;
  constructor(spec: Spec) {
    this.spec = spec;
  }

  /** @internal */
  build(maxDepth: number = Infinity) {
    if (this.spec.subclauses.length === 0) {
      return;
    }

    const html = Toc.build(this.spec, { maxDepth });
    const tocContainer = this.spec.doc.createElement('div');
    tocContainer.setAttribute('id', 'toc');
    tocContainer.innerHTML = '<h2>Contents</h2>' + html;
    const intro = this.spec.doc.querySelector('emu-intro, emu-clause, emu-annex');
    if (intro && intro.parentNode) {
      intro.parentNode.insertBefore(tocContainer, intro);
    }

    const bodyClass = this.spec.doc.body.getAttribute('class') || '';
    this.spec.doc.body.setAttribute('class', bodyClass + ' oldtoc');
  }

  static build(level: Spec | Clause, { maxDepth = Infinity, expandy = false } = {}) {
    if (maxDepth <= 0) {
      return '';
    }

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

      html += `<a href="#${sub.id}" title="${sub.title}">`;
      if (sub.number) {
        if (sub.isBackMatter) {
          html += `<span>${shorten(sub.titleHTML)}</span>`;
        } else if (sub.isAnnex) {
          const isInnerAnnex = sub.node.parentElement?.nodeName === 'EMU-ANNEX';
          if (isInnerAnnex) {
            html += `<span class="secnum">Annex ${sub.number}</span> ${shorten(sub.titleHTML)}`;
          } else {
            html += `<span class="secnum">Annex ${sub.number} <span class="annex-kind">(${sub.isNormative ? 'normative' : 'informative'})</span></span> ${shorten(sub.titleHTML)}`;
          }
        } else {
          html += `<span class="secnum">${sub.number}</span> ${shorten(sub.titleHTML)}`;
        }
      }
      html += '</a>';
      if (sub.subclauses.length > 0) html += Toc.build(sub, { maxDepth: maxDepth - 1, expandy });
      html += '</li>';
    });

    html += '</ol>';

    return html;
  }
}

function shorten(title: string) {
  return title.replace('Static Semantics:', 'SS:').replace('Runtime Semantics:', 'RS:');
}
