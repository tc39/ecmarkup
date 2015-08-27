'use strict';
const Builder = require('./Builder');
const utils = require('./utils');

module.exports = class Xref extends Builder {
  build() {
    const xref = this.node;
    const href = xref.getAttribute('href');
    const aoid = xref.getAttribute('aoid');

    if (href && aoid) {
      utils.logWarning('xref can\'t have both href and aoid.');
      return;
    }

    if (!href && !aoid) {
      utils.logWarning('xref has no href or aoid.');
      return;
    }

    if (href) {
      if (href[0] !== '#') {
        utils.logWarning('xref to anything other than a fragment id is not supported (is ' + href + '). Try href="#sec-id" instead.');
        return;
      }

      const id = href.slice(1);

      const entry = this.spec.lookupBiblioEntryById(id);
      if (!entry) {
        utils.logWarning('can\'t find clause, production, note or example with id ' + href);
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
        buildFigureLink(this.spec, xref, entry.entry, 'Example');
        break;
      case 'note':
        buildFigureLink(this.spec, xref, entry.entry, 'Note');
        break;
      case 'table':
        buildFigureLink(this.spec, xref, entry.entry, 'Table');
        break;
      case 'figure':
        buildFigureLink(this.spec, xref, entry.entry, 'Figure');
        break;
      default:
        utils.logWarning('found unknown biblio entry (this is a bug, please file it)');
      }
    } else if (aoid) {
      const entry = this.spec.biblio.ops[aoid] || this.spec.externalBiblio.ops[aoid];

      if (entry) {
        buildAOLink(xref, entry);
        return;
      }

      utils.logWarning('can\'t find abstract op with aoid ' + aoid);
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

function buildFigureLink(spec, xref, entry, type) {
  if (xref.textContent.trim() === '') {
    if (entry.clauseId) {
      // first need to find the associated clause
      const clauseEntry = spec.lookupBiblioEntryById(entry.clauseId);
      if (clauseEntry.type !== 'clause') {
        utils.logWarning('could not find parent clause for ' + type + ' id ' + entry.id);
      }

      const parentClause = utils.parent(xref, ['EMU-CLAUSE', 'EMU-INTRO', 'EMU-ANNEX']);
      if (parentClause && parentClause.id === clauseEntry.entry.id) {
        xref.innerHTML = buildXrefLink(entry, type + ' ' + entry.number);
      } else {
        if (xref.hasAttribute('title')) {
          xref.innerHTML = buildXrefLink(entry, clauseEntry.entry.title + ' ' + type + ' ' + entry.number);
        } else {
          xref.innerHTML = buildXrefLink(entry, clauseEntry.entry.number + ' ' + type + ' ' + entry.number);
        }
      }
    } else {
      xref.innerHTML = buildXrefLink(entry, type + ' ' + entry.number);
    }
  } else {
    xref.innerHTML = buildXrefLink(entry, xref.innerHTML);
  }
}

function buildXrefLink(entry, contents) {
  return '<a href="' + entry.location + '#' + entry.id + '">' + contents + '</a>';

}
