import type Spec from './Spec';
import type { Context } from './Context';
import type * as Biblio from './Biblio';
import type Clause from './Clause';

import { attrValueLocation, offsetToLineAndColumn, getLocation } from './utils';
import Builder from './Builder';

/*@internal*/
export default class Xref extends Builder {
  namespace: string;
  href: string;
  aoid: string;
  clause: Clause | null;
  id: string;
  entry: Biblio.BiblioEntry | undefined;

  static elements = ['EMU-XREF'];

  constructor(
    spec: Spec,
    node: HTMLElement,
    clause: Clause | null,
    namespace: string,
    href: string,
    aoid: string
  ) {
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
      spec.warn({
        type: 'node',
        ruleId: 'invalid-xref',
        message: "xref can't have both href and aoid",
        node,
      });
      return;
    }

    if (!href && !aoid) {
      spec.warn({
        type: 'node',
        ruleId: 'invalid-xref',
        message: 'xref has neither href nor aoid',
        node,
      });
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
        spec.warn({
          type: 'node',
          ruleId: 'invalid-xref',
          message: `xref to anything other than a fragment id is not supported (is ${JSON.stringify(href)}). try href="#sec-id" instead`,
          node: this.node,
        });
        return;
      }

      const id = href.slice(1);

      this.entry = spec.biblio.byId(id);
      if (!this.entry) {
        // let nodeLoc = getLocation(spec.dom, this.node);
        // let loc = attrValueLocation(spec.sourceText, nodeLoc, 'href');
        spec.warn({
          type: 'attr',
          attr: 'href',
          ruleId: 'xref-not-found',
          message: `can't find clause, production, note or example with id ${JSON.stringify(id)}`,
          node: this.node,
        });
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
        case 'step':
          buildStepLink(spec, node, this.entry);
          break;
        default: {
          spec.warn({
            type: 'node',
            ruleId: 'unknown-biblio',
            message: `found unknown biblio entry ${this.entry.type} (this is a bug, please file it with ecmarkup)`,
            node: this.node,
          });
        }
      }
    } else if (aoid) {
      this.entry = spec.biblio.byAoid(aoid, namespace);

      if (this.entry) {
        buildAOLink(node, this.entry);
        return;
      }

      // let nodeLoc = getLocation(spec.dom, this.node);
      // let loc = attrValueLocation(spec.sourceText, nodeLoc, 'aoid');
      let namespaceSuffix = namespace === '<no location>' ? '' : ` in namespace ${JSON.stringify(namespace)}`;
      spec.warn({
        type: 'attr',
        attr: 'aoid',
        ruleId: 'xref-not-found',
        message: `can't find abstract op with aoid ${JSON.stringify(aoid)}` + namespaceSuffix,
        node: this.node,
      });
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
function buildFigureLink(
  spec: Spec,
  parentClause: Clause | null,
  xref: Element,
  entry: Biblio.FigureBiblioEntry,
  type: string
) {
  if (xref.textContent!.trim() === '') {
    if (entry.clauseId) {
      // first need to find the associated clause
      const clauseEntry = spec.biblio.byId(entry.clauseId);
      if (clauseEntry.type !== 'clause') {
        spec.warn({
          type: 'node',
          ruleId: 'invalid-xref',
          message: `could not find parent clause for ${type} id ${entry.id}`,
          node: entry.node,
        });
        return;
      }

      if (parentClause && parentClause.id === clauseEntry.id) {
        xref.innerHTML = buildXrefLink(entry, type + ' ' + entry.number);
      } else {
        if (xref.hasAttribute('title')) {
          xref.innerHTML = buildXrefLink(
            entry,
            clauseEntry.title + ' ' + type + ' ' + entry.number
          );
        } else {
          xref.innerHTML = buildXrefLink(
            entry,
            clauseEntry.number + ' ' + type + ' ' + entry.number
          );
        }
      }
    } else {
      xref.innerHTML = buildXrefLink(entry, type + ' ' + entry.number);
    }
  } else {
    xref.innerHTML = buildXrefLink(entry, xref.innerHTML);
  }
}

let decimalBullet = Array.from({ length: 100 }).map((a, i) => '' + (i + 1));
let alphaBullet = Array.from({ length: 26 }).map((a, i) =>
  String.fromCharCode('a'.charCodeAt(0) + i)
);
// prettier-ignore
let romanBullet = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x', 'xi', 'xii', 'xiii', 'xiv', 'xv', 'xvi', 'xvii', 'xviii', 'xix', 'xx', 'xxi', 'xxii', 'xxiii', 'xxiv', 'xxv'];
let bullets = [decimalBullet, alphaBullet, romanBullet, decimalBullet, alphaBullet, romanBullet];

function buildStepLink(spec: Spec, xref: Element, entry: Biblio.StepBiblioEntry) {
  if (xref.innerHTML !== '') {
    let nodeLoc = getLocation(spec.dom, xref);
    // TODO switch to using nodeLoc.startTag.end{Line,Col} once parse5 can be upgraded
    // let tagSrc = spec.sourceText!.slice(nodeLoc.startTag.startOffset, nodeLoc.startTag.endOffset);
    // let relativeLoc = offsetToLineAndColumn(tagSrc, nodeLoc.startTag.endOffset - nodeLoc.startOffset);
    // let line = nodeLoc.line + relativeLoc.line - 1;
    // let column = relativeLoc.line === 1 ? (nodeLoc.startTag.col + relativeLoc.column - 1) : relativeLoc.column;
    spec.warn({
      type: 'contents',
      ruleId: 'step-xref-contents',
      message: 'the contents of emu-xrefs to steps are ignored',
      node: xref,
      nodeRelativeLine: 1,
      nodeRelativeColumn: 1,
    });
  }

  let stepBullets = entry.stepNumbers.map((s, i) => {
    let applicable = bullets[Math.min(i, 5)];
    if (s > applicable.length) {
      spec.warn({
        type: 'attr',
        ruleId: 'high-step-number',
        message: `ecmarkup does not know how to deal with step numbers as high as ${s}; if you need this, open an issue on ecmarkup`,
        node: xref,
        attr: 'href',
      });
      return '?';
    }
    return applicable[s - 1];
  });
  let text = stepBullets.join('.');
  xref.innerHTML = buildXrefLink(entry, text);
}

function buildXrefLink(entry: Biblio.BiblioEntry, contents: string | number | undefined | null) {
  return '<a href="' + entry.location + '#' + (entry.id || entry.refId) + '">' + contents + '</a>';
}
