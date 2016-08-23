"use strict";
const Builder = require("./Builder");
/*@internal*/
class Terminal extends Builder {
    constructor(spec, prod, node) {
        super(spec, node);
        this.production = prod;
        this.optional = node.hasAttribute('optional');
    }
    build() {
        let modifiers = '';
        if (this.optional) {
            modifiers += '<emu-opt>opt</emu-opt>';
        }
        if (modifiers === '')
            return;
        const el = this.spec.doc.createElement('emu-mods');
        el.innerHTML = modifiers;
        this.node.appendChild(el);
    }
}
module.exports = Terminal;
//# sourceMappingURL=Terminal.js.map