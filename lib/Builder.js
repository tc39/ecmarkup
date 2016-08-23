"use strict";
/*@internal*/
class Builder {
    constructor(spec, node) {
        this.spec = spec;
        this.node = node;
    }
    build(...args) {
        throw new Error('Builder not implemented');
    }
}
module.exports = Builder;
//# sourceMappingURL=Builder.js.map