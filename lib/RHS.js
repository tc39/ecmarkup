"use strict";
/*@internal*/
class RHS {
    constructor(spec, prod, node) {
        this.spec = spec;
        this.production = prod;
        this.node = node;
        this.constraints = node.getAttribute('constraints');
        this.alternativeId = node.getAttribute('a');
    }
    build() {
        if (this.node.textContent === '') {
            this.node.textContent = '[empty]';
            return;
        }
        if (this.constraints) {
            const cs = this.spec.doc.createElement('emu-constraints');
            cs.textContent = '[' + this.constraints + ']';
            this.node.insertBefore(cs, this.node.childNodes[0]);
        }
        this.terminalify(this.node);
    }
    terminalify(parentNode) {
        for (let i = 0; i < parentNode.childNodes.length; i++) {
            const node = parentNode.childNodes[i];
            if (node.nodeType === 3) {
                const text = node.textContent.trim();
                const pieces = text.split(/\s/);
                pieces.forEach(function (p) {
                    if (p.length === 0) {
                        return;
                    }
                    const est = this.spec.doc.createElement('emu-t');
                    est.textContent = p;
                    parentNode.insertBefore(est, node);
                }, this);
                parentNode.removeChild(node);
            }
        }
    }
}
module.exports = RHS;
//# sourceMappingURL=RHS.js.map