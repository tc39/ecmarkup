"use strict";
const Spec_ = require('./Spec');
const utils = require('./utils');
function build(path, fetch, opts) {
    return fetch(path)
        .then(utils.htmlToDoc)
        .then(doc => {
        return new Spec_(path, fetch, doc, opts).build();
    });
}
exports.build = build;
//# sourceMappingURL=ecmarkup.js.map