'use strict';

const Builder = require('./Builder');
const parent = require('./utils').parent;

module.exports = class Dfn extends Builder {
  build() {
    const id = getClosestId(this.node);
    if (!id) return;

    this.spec.biblio.terms[this.node.textContent] = {
      id: id,
      location: ''
    };
  }
};

function getClosestId(node) {
  if (node.id) return node.id;

  const parentClause = parent(node, ['EMU-CLAUSE', 'EMU-INTRO', 'EMU-ANNEX']);
  if (!parentClause) return null;

  return parentClause.id;
}
