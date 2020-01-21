import Spec from "./Spec";
import Builder from './Builder';
import { Context } from './Context';
import utils = require('./utils');
import * as Biblio from './Biblio';
import Clause from './Clause';

/*@internal*/
export default class Xref extends Builder {
  namespace: string;
  href: string;
  aoid: string;
  clause: Clause | null;
  id: string;
  entry: Biblio.BiblioEntry | undefined;

  static elements = ['EMU-XREF'];

  constructor(spec: Spec, node: HTMLElement, clause: Clause | null, namespace: string, href: string, aoid: string) {
    super(spec, node);
    this.namespace = namespace;
    this.href = href;
    this.aoid = aoid;
    this.clause = clause;
    this.id = node.getAttribute('id')!;
  }

  static enter({ node, spec, clauseStack }: Context) {
    const href = node.getAttribute('href')!;
    const aoid = node.getAttribute('aoid')!;
    const parentClause = clauseStack[clauseStack.length - 1];

    let namespace: string;
    if (node.hasAttribute('namespace')) {
      namespace = node.getAttribute('namespace')!;
    } else {
      namespace = parentClause ? parentClause.namespace : spec.namespace;
    }

    if (href && aoid) {
      utils.logWarning('xref can\'t have both href and aoid.');
      return;
    }

    if (!href && !aoid) {
      utils.logWarning('xref has no href or aoid.');
      console.log(node.outerHTML);
      return;
    }

    const xref = new Xref(spec, node, parentClause, namespace, href, aoid);
    spec._xrefs.push(xref);
  }


  build() {
    const spec = this.spec;
    const href = this.href;
    const node = this.node;
    const aoid = this.aoid;
    const namespace = this.namespace;

    if (href) {
      if (href[0] !== '#') {
        utils.logWarning('xref to anything other than a fragment id is not supported (is ' + href + '). Try href="#sec-id" instead.');
        return;
      }

      const id = href.slice(1);

      this.entry = spec.biblio.byId(id);
      if (!this.entry) {
        utils.logWarning('can\'t find clause, production, note or example with id ' + href);
        return;
      }

      switch (this.entry.type) {
      case 'clause':
        buildClauseLink(node, this.entry);
        break;
      case 'production':
        buildProductionLink(node, this.entry);
        break;
      case 'example':
        buildFigureLink(spec, this.clause, node, this.entry, 'Example');
        break;
      case 'note':
        buildFigureLink(spec, this.clause, node, this.entry, 'Note');
        break;
      case 'table':
        buildFigureLink(spec, this.clause, node, this.entry, 'Table');
        break;
      case 'figure':
        buildFigureLink(spec, this.clause, node, this.entry, 'Figure');
        break;
      case 'term':
        buildTermLink(node, this.entry);
        break;
      default:
        utils.logWarning('found unknown biblio entry (this is a bug, please file it)');
      }
    } else if (aoid) {
      this.entry = spec.biblio.byAoid(aoid, namespace);

      if (this.entry) {
        buildAOLink(node, this.entry);
        return;
      }

      utils.logWarning('can\'t find abstract op with aoid ' + aoid + ' in namespace ' + namespace);
    }
  }
}

function buildClauseLink(xref: Element, entry: Biblio.ClauseBiblioEntry) {
  if (xref.textContent!.trim() === '') {
    if (xref.hasAttribute('title')) {
      // titleHTML might not be present from older biblio files.
      xref.innerHTML = buildXrefLink(entry, entry.titleHTML || entry.title);
    } else {
      xref.innerHTML = buildXrefLink(entry, entry.number);
    }
  } else {
    xref.innerHTML = buildXrefLink(entry, xref.innerHTML);
  }
}

function buildProductionLink(xref: Element, entry: Biblio.ProductionBiblioEntry) {
  if (xref.textContent!.trim() === '') {
    xref.innerHTML = buildXrefLink(entry, '<emu-nt>' + entry.name + '</emu-nt>');
  } else {
    xref.innerHTML = buildXrefLink(entry, xref.innerHTML);
  }
}

function buildAOLink(xref: Element, entry: Biblio.BiblioEntry) {
  if (xref.textContent!.trim() === '') {
    xref.innerHTML = buildXrefLink(entry, xref.getAttribute('aoid'));
  } else {
    xref.innerHTML = buildXrefLink(entry, xref.innerHTML);
  }
}

function buildTermLink(xref: Element, entry: Biblio.TermBiblioEntry) {
  if (xref.textContent!.trim() === '') {
    xref.innerHTML = buildXrefLink(entry, entry.term);
  } else {
    xref.innerHTML = buildXrefLink(entry, xref.innerHTML);
  }
}
function buildFigureLink(spec: Spec, parentClause: Clause | null, xref: Element, entry: Biblio.FigureBiblioEntry, type: string) {
  if (xref.textContent!.trim() === '') {
    if (entry.clauseId) {
      // first need to find the associated clause
      const clauseEntry = spec.biblio.byId(entry.clauseId);
      if (clauseEntry.type !== 'clause') {
        utils.logWarning('could not find parent clause for ' + type + ' id ' + entry.id);
        return;
      }

      if (parentClause && parentClause.id === clauseEntry.id) {
        xref.innerHTML = buildXrefLink(entry, type + ' ' + entry.number);
      } else {
        if (xref.hasAttribute('title')) {
          xref.innerHTML = buildXrefLink(entry, clauseEntry.title + ' ' + type + ' ' + entry.number);
        } else {
          xref.innerHTML = buildXrefLink(entry, clauseEntry.number + ' ' + type + ' ' + entry.number);
        }
      }
    } else {
      xref.innerHTML = buildXrefLink(entry, type + ' ' + entry.number);
    }
  } else {
    xref.innerHTML = buildXrefLink(entry, xref.innerHTML);
  }
}

function buildXrefLink(entry: Biblio.BiblioEntry, contents: string | number | undefined | null) {
  return '<a href="' + entry.location + '#' + (entry.id || entry.refId) + '">' + contents + '</a>';
}