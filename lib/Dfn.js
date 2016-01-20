'use strict';

const Builder = require('./Builder');
const parent = require('./utils').parent;

module.exports = class Dfn extends Builder {
  build() {
    const parentClause = parent(this.node, ['EMU-CLAUSE', 'EMU-INTRO', 'EMU-ANNEX']);
    if (!parentClause) return;

    const entry = {
      type: 'term',
      term: this.node.textContent,
      refId: parentClause.id
    }

    if (this.node.hasAttribute('id')) {
      entry.id = this.node.id;
    }

    this.spec.biblio.push(entry);
  }
};
