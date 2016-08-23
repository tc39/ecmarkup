"use strict";
const Builder = require('./Builder');
const utils = require('./utils');
var parent = utils.parent;
/*@internal*/
class Dfn extends Builder {
    build() {
        const parentClause = parent(this.node, ['EMU-CLAUSE', 'EMU-INTRO', 'EMU-ANNEX']);
        if (!parentClause)
            return;
        const entry = {
            type: 'term',
            term: this.node.textContent,
            refId: parentClause.id
        };
        if (this.node.hasAttribute('id')) {
            entry.id = this.node.id;
        }
        this.spec.biblio.add(entry, parentClause.getAttribute("namespace"));
    }
}
module.exports = Dfn;
//# sourceMappingURL=Dfn.js.map