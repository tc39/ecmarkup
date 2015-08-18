'use strict';
const Builder = require('./Builder');

module.exports = class Xref extends Builder {
  build() {
    const xref = this.node;
    const href = xref.getAttribute('href');
    const aoid = xref.getAttribute('aoid');

    if (href && aoid) {
      console.log('Warning: xref can\'t have both href and aoid.');
      return;
    }

    if (!href && !aoid) {
      console.log('Warning: xref has no href or aoid.');
      return;
    }

    if (href) {
      if (href[0] !== '#') {
        console.log('Warning: xref to anything other than a fragment id is not supported (is ' + href + '). Try href="#sec-id" instead.');
        return;
      }

      let entry = this.spec.biblio.clauses[href.slice(1)] || this.spec.externalBiblio.clauses[href.slice(1)];
      if (entry) {
        buildClauseLink(xref, entry);
        return;
      }

      entry = this.spec.biblio.productions[href.slice(1)] || this.spec.externalBiblio.productions[href.slice(1)];
      if (entry) {
        buildProductionLink(xref, entry);
        return;
      }
    } else if (aoid) {
      const entry = this.spec.biblio.ops[aoid] || this.spec.externalBiblio.ops[aoid];

      if (entry) {
        buildAOLink(xref, entry);
        return;
      }
    }

    console.log('Warning: can\'t find clause or production with id ' + href);
  }
};

function buildClauseLink(xref, entry) {
  if (xref.textContent.trim() === '') {
    if (xref.hasAttribute('title')) {
      xref.innerHTML = buildXrefLink(entry, entry.title);
    } else {
      xref.innerHTML = buildXrefLink(entry, entry.number);
    }
  } else {
    xref.innerHTML = buildXrefLink(entry, xref.innerHTML);
  }
}

function buildProductionLink(xref, entry) {
  if (xref.textContent.trim() === '') {
    xref.innerHTML = buildXrefLink(entry, '<emu-nt>' + entry.name + '</emu-nt>');
  } else {
    xref.innerHTML = buildXrefLink(entry, xref.innerHTML);
  }
}

function buildAOLink(xref, entry) {
  if (xref.textContent.trim() === '') {
    xref.innerHTML = buildXrefLink(entry, xref.getAttribute('aoid'));
  } else {
    xref.innerHTML = buildXrefLink(entry, xref.innerHTML);
  }
}

function buildXrefLink(entry, contents) {
  return '<a href="' + entry.location + '#' + entry.id + '">' + contents + '</a>';

}
