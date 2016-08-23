"use strict";
const Builder = require('./Builder');
const emd = require('ecmarkdown');
/*@internal*/
class Algorithm extends Builder {
    build() {
        const contents = this.node.innerHTML;
        let html = emd.document(contents);
        this.node.innerHTML = html;
    }
}
module.exports = Algorithm;
//# sourceMappingURL=Algorithm.js.map