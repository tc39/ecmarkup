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

      const id = href.slice(1);

      const entry = this.spec.lookupBiblioEntryById(id);
      if (!entry) {
        console.log('Warning: can\'t find clause, production or example with id ' + href);
        return;
      }

      switch (entry.type) {
      case 'clause':
        buildClauseLink(xref, entry.entry);
        break;
      case 'production':
        buildProductionLink(xref, entry.entry);
        break;
      case 'example':
        buildExampleLink(this.spec, xref, entry.entry);
        break;
      default:
        console.log('Warning: found unknown biblio entry (this is a bug, please file it)');
      }
    } else if (aoid) {
      const entry = this.spec.biblio.ops[aoid] || this.spec.externalBiblio.ops[aoid];

      if (entry) {
        buildAOLink(xref, entry);
        return;
      }

      console.log('Warning: can\'t find abstract op with aoid ' + aoid);
    }

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

function buildExampleLink(spec, xref, entry) {
  if (xref.textContent.trim() === '') {
    // first need to find the associated clause
    const clauseEntry = spec.lookupBiblioEntryById(entry.clauseId);
    if (clauseEntry.type !== 'clause') {
      console.log('Warning: could not find parent clause for example id ' + entry.id);
    }

    if (xref.hasAttribute('title')) {
      xref.innerHTML = buildXrefLink(entry, clauseEntry.entry.title + ' Example ' + entry.number);
    } else {
      xref.innerHTML = buildXrefLink(entry, clauseEntry.entry.number + ' Example ' + entry.number);
    }
  } else {
    xref.innerHTML = buildXrefLink(entry, xref.innerHTML);
  }
}

function buildXrefLink(entry, contents) {
  return '<a href="' + entry.location + '#' + entry.id + '">' + contents + '</a>';

}
