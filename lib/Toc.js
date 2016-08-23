"use strict";
const emd = require('ecmarkdown');
/*@internal*/
class Toc {
    constructor(spec) {
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
        intro.parentNode.insertBefore(tocContainer, intro);
        const bodyClass = this.spec.doc.body.getAttribute('class') || '';
        this.spec.doc.body.setAttribute('class', bodyClass + ' oldtoc');
    }
    static build(level, expandy) {
        let html = '<ol class="toc">';
        level.subclauses.forEach(sub => {
            html += '<li>';
            if (expandy) {
                if (sub.subclauses.length > 0) {
                    html += '<span class="item-toggle">◢</span>';
                }
                else {
                    html += '<span class="item-toggle-none"></span>';
                }
            }
            html += '<a href="#' + sub.id + '" title="' + sub.title + '"><span class="secnum">' + sub.number + '</span> ' + emd.fragment(shorten(sub.title)) + '</a>';
            if (sub.subclauses.length > 0)
                html += Toc.build(sub, expandy);
            html += '</li>';
        });
        html += '</ol>';
        return html;
    }
}
;
function shorten(title) {
    return title.replace('Static Semantics:', 'SS:')
        .replace('Runtime Semantics:', 'RS:');
}
module.exports = Toc;
//# sourceMappingURL=Toc.js.map