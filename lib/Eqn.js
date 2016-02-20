'use strict';
const Algorithm = require('./Algorithm');
const emd = require('ecmarkdown');
const utils = require('./utils');

module.exports = class Eqn extends Algorithm {
  constructor(spec, node) {
    super(spec, node);
    this.aoid = node.getAttribute('aoid');
    this.id = utils.getParentClauseId(node);

    if (this.aoid) {
      this.spec.biblio.add({
        type: 'op',
        aoid: this.aoid,
        refId: this.id
      });
    }
  }

  build() {
    let contents = emd.document(this.node.innerHTML).slice(3, -4);

    if (utils.shouldInline(this.node)) {
      const classString = this.node.getAttribute('class');
      let classes;

      if (classString) {
        classes = classString.split(' ');
      } else {
        classes = [];
      }

      if (classes.indexOf('inline') === -1) {
        this.node.setAttribute('class', classes.concat(['inline']).join(' '));
      }
    } else {
      contents = '<div>' + contents.split(/\r?\n/g)
                                   .filter(s => s.trim().length > 0)
                                   .join('</div><div>') + '</div>';
    }

    this.node.innerHTML = contents;

  }
};
