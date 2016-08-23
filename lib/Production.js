"use strict";
const RHS = require('./RHS');
const GrammarAnnotation = require('./GrammarAnnotation');
const Terminal = require('./Terminal');
const Builder = require('./Builder');
const utils = require('./utils');
/*@internal*/
class Production extends Builder {
    constructor(spec, node) {
        super(spec, node);
        this.type = node.getAttribute('type');
        this.name = node.getAttribute('name'); // TODO: unchecked
        this.params = node.getAttribute('params');
        this.optional = node.hasAttribute('optional');
        this.oneOf = node.hasAttribute('oneof');
        this.rhses = [];
        this.rhsesById = {};
        this.namespace = utils.getNamespace(spec, node);
        const rhses = this.node.querySelectorAll('emu-rhs');
        for (let i = 0; i < rhses.length; i++) {
            const rhs = new RHS(this.spec, this, rhses[i]);
            this.rhses.push(rhs);
            if (rhs.alternativeId) {
                this.rhsesById[rhs.alternativeId] = rhs;
            }
        }
        const id = this._id();
        const entry = this.spec.biblio.byProductionName(this.name, this.namespace);
        // primary if it's the first production with this name in this namespace or
        // the primary attribute is on this production or the parent emu-grammar clause.
        this.primary = !entry ||
            entry.namespace !== this.namespace ||
            node.hasAttribute('primary') ||
            node.parentNode.hasAttribute('primary');
        if (this.primary) {
            this.id = id;
            if (entry && entry.namespace === this.namespace && entry._instance) {
                entry._instance.primary = false;
            }
            const newEntry = {
                type: 'production',
                id: id,
                name: this.name,
            };
            // non-enumerable to JSON-stringifying the biblio doesn't include this
            Object.defineProperty(newEntry, '_instance', { value: this });
            this.spec.biblio.add(newEntry, this.namespace);
        }
    }
    _id() {
        if (this.namespace && this.namespace !== this.spec.namespace) {
            return `prod-${this.namespace}-${this.name}`;
        }
        else {
            return `prod-${this.name}`;
        }
    }
    build() {
        const ntNode = this.spec.doc.createElement('emu-nt');
        ntNode.innerHTML = '<a href="#prod-' + this.name + '">' + this.name + '</a>';
        if (this.params)
            ntNode.setAttribute('params', this.params);
        if (this.optional)
            ntNode.setAttribute('optional', '');
        this.node.insertBefore(ntNode, this.node.children[0]);
        const geq = this.spec.doc.createElement('emu-geq');
        if (this.type === 'lexical') {
            geq.textContent = '::';
        }
        else if (this.type === 'regexp') {
            geq.textContent = ':::';
        }
        else {
            geq.textContent = ':';
        }
        this.node.insertBefore(geq, ntNode.nextSibling);
        if (this.oneOf) {
            const elem = this.spec.doc.createElement('emu-oneof');
            elem.textContent = 'one of';
            this.node.insertBefore(elem, geq.nextSibling);
        }
        this.rhses.forEach(rhs => rhs.build());
        const ganns = this.node.querySelectorAll('emu-gann');
        for (let i = 0; i < ganns.length; i++) {
            new GrammarAnnotation(this.spec, this, ganns[i]).build();
        }
        const ts = this.node.querySelectorAll('emu-t');
        for (let i = 0; i < ts.length; i++) {
            new Terminal(this.spec, this, ts[i]).build();
        }
        if (this.primary) {
            this.node.setAttribute('id', this.id);
        }
        if (utils.shouldInline(this.node)) {
            const cls = this.node.getAttribute('class') || '';
            if (cls.indexOf('inline') === -1) {
                this.node.setAttribute('class', cls + ' inline');
            }
        }
    }
}
Production.byName = {};
module.exports = Production;
//# sourceMappingURL=Production.js.map