'use strict';

const Builder = require('./Builder');
const parent = require('./utils').parent;

module.exports = class Dfn extends Builder {
  build() {
    const parentClause = parent(this.node, ['EMU-CLAUSE', 'EMU-INTRO', 'EMU-ANNEX']);
    if (!parentClause) return;

    this.spec.biblio.terms[this.node.textContent] = {
      id: parentClause.id,
      location: ''
    };
  }
};
