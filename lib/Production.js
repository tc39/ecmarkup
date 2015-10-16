'use strict';
const RHS = require('./RHS');
const GrammarAnnotation = require('./GrammarAnnotation');
const Terminal = require('./Terminal');
const Builder = require('./Builder');

module.exports = class Production extends Builder {
  constructor(spec, node) {
    super(spec, node);
    this.type = node.getAttribute('type');
    this.name = node.getAttribute('name');
    this.params = node.getAttribute('params');
    this.optional = node.hasAttribute('optional');
    this.oneOf = node.hasAttribute('oneof');
    this.rhses = [];
    this.rhsesById = {};

    const rhses = this.node.querySelectorAll('emu-rhs');
    for (let i = 0; i < rhses.length; i++) {
      const rhs = new RHS(this.spec, this, rhses[i]);
      this.rhses.push(rhs);

      if (rhs.alternativeId) {
        this.rhsesById[rhs.alternativeId] = rhs;
      }
    }

    const id = 'prod-' + this.name;
    if (!this.spec.biblio.productions[id]) {
      this.id = id;
      this.primary = true;
      this.spec.biblio.productions[this.id] = { id: id, location: '', name: this.name };
    }

    if (!this.spec._prodsByName[this.name]) {
      this.spec._prodsByName[this.name] = this;
    }
  }

  build() {
    const ntNode = this.spec.doc.createElement('emu-nt');
    ntNode.innerHTML = '<a href="#prod-' + this.name + '">' + this.name + '</a>';
    if (this.params) ntNode.setAttribute('params', this.params);
    if (this.optional) ntNode.setAttribute('optional');
    this.node.insertBefore(ntNode, this.node.children[0]);

    const geq = this.spec.doc.createElement('emu-geq');
    if (this.type === 'lexical') {
      geq.textContent = '::';
    } else if (this.type === 'numeric') {
      geq.textContent = ':::';
    } else {
      geq.textContent = ':';
    }

    this.node.insertBefore(geq, ntNode.nextSibling);

    if (this.oneOf) {
      const elem = this.spec.doc.createElement('emu-oneof');
      elem.textContent = 'one of';
      this.node.insertBefore(elem, geq.nextSibling);
    }

    this.rhses.forEach(function (rhs) {
      rhs.build();
    });

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


    if (Production.shouldInline(this)) {
      const cls = this.node.getAttribute('class') || '';

      if (cls.indexOf('inline') === -1) {
        this.node.setAttribute('class', cls + ' inline');
      }
    }
  }

  static shouldInline(prod) {
    let parent = prod.node.parentNode;

    while (parent.nodeName === 'EMU-GRAMMAR' || parent.nodeName === 'EMU-IMPORT') {
      parent = parent.parentNode;
    }

    return ['EMU-ANNEX', 'EMU-CLAUSE', 'EMU-INTRO', 'EMU-NOTE', 'BODY'].indexOf(parent.nodeName) === -1;
  }
};

