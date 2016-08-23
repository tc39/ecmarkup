"use strict";
const Spec = require('./Spec');
const utils = require('./utils');
function build(path, fetch, opts) {
    return fetch(path)
        .then(utils.htmlToDoc)
        .then(doc => {
        return new Spec(path, fetch, doc, opts).build();
    });
}
exports.build = build;
//# sourceMappingURL=ecmarkup.js.map