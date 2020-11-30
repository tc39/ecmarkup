import type Spec from './Spec';
import type { ProductionBiblioEntry } from './Biblio';
import type { Context } from './Context';

import RHS from './RHS';
import GrammarAnnotation from './GrammarAnnotation';
import Terminal from './Terminal';
import Builder from './Builder';
import * as utils from './utils';

/*@internal*/
export default class Production extends Builder {
  static byName = {};

  type: string | null;
  name: string;
  params: string | null;
  optional: boolean;
  oneOf: boolean;
  rhses: RHS[];
  rhsesById: { [id: string]: RHS };
  namespace: string;
  primary: boolean;
  id: string | undefined;

  constructor(spec: Spec, node: HTMLElement, namespace: string) {
    super(spec, node);
    this.type = node.getAttribute('type');
    this.name = node.getAttribute('name')!; // TODO: unchecked
    this.params = node.getAttribute('params');
    this.optional = node.hasAttribute('optional');
    this.oneOf = node.hasAttribute('oneof');
    this.rhses = [];
    this.rhsesById = {};
    this.namespace = namespace;

    const rhses = this.node.querySelectorAll('emu-rhs') as NodeListOf<HTMLElement>;
    for (let i = 0; i < rhses.length; i++) {
      const rhs = new RHS(this.spec, this, rhses[i]);
      this.rhses.push(rhs);

      if (rhs.alternativeId) {
        this.rhsesById[rhs.alternativeId] = rhs;
      }
    }

    const id = this._id();

    const entry = this.spec.biblio.byProductionName(this.name!, this.namespace);

    // primary if it's the first production with this name in this namespace or
    // the primary attribute is on this production or the parent emu-grammar clause.
    this.primary =
      !entry ||
      entry.namespace !== this.namespace ||
      node.hasAttribute('primary') ||
      (<Element>node.parentNode).hasAttribute('primary');

    if (this.primary) {
      this.id = id;

      if (entry && entry.namespace === this.namespace && entry._instance) {
        entry._instance.primary = false;
        entry._instance.node.removeAttribute('id');
      }

      const newEntry: ProductionBiblioEntry = {
        type: 'production',
        id: id,
        name: this.name,
        referencingIds: [],
      };

      // non-enumerable to JSON-stringifying the biblio doesn't include this
      Object.defineProperty(newEntry, '_instance', { value: this });

      this.spec.biblio.add(newEntry, this.namespace);
    }
  }

  private _id() {
    if (this.namespace && this.namespace !== this.spec.namespace) {
      return `prod-${this.namespace}-${this.name}`;
    } else {
      return `prod-${this.name}`;
    }
  }

  static async enter({ spec, node, clauseStack }: Context) {
    const ntNode = spec.doc.createElement('emu-nt');
    const clause = clauseStack[clauseStack.length - 1];
    const prod = new Production(spec, node, clause ? clause.namespace : spec.namespace);
    ntNode.innerHTML = '<a href="#prod-' + prod.name + '">' + prod.name + '</a>';
    if (prod.params) ntNode.setAttribute('params', prod.params);
    if (prod.optional) ntNode.setAttribute('optional', '');
    node.insertBefore(ntNode, node.children[0]);

    const geq = spec.doc.createElement('emu-geq');
    if (prod.type === 'lexical') {
      geq.textContent = '::';
    } else if (prod.type === 'regexp') {
      geq.textContent = ':::';
    } else {
      geq.textContent = ':';
    }

    node.insertBefore(spec.doc.createTextNode(' '), ntNode.nextSibling);
    node.insertBefore(geq, ntNode.nextSibling);
    node.insertBefore(spec.doc.createTextNode(' '), ntNode.nextSibling);

    if (prod.oneOf) {
      const elem = spec.doc.createElement('emu-oneof');
      elem.textContent = 'one of';
      node.insertBefore(elem, geq.nextSibling);
      node.insertBefore(spec.doc.createTextNode(' '), elem);
    }

    prod.rhses.forEach(rhs => rhs.build());

    const ganns = node.querySelectorAll('emu-gann') as NodeListOf<HTMLElement>;
    for (let i = 0; i < ganns.length; i++) {
      new GrammarAnnotation(spec, prod, ganns[i]).build();
    }

    const ts = node.querySelectorAll('emu-t') as NodeListOf<HTMLElement>;
    for (let i = 0; i < ts.length; i++) {
      new Terminal(spec, prod, ts[i]).build();
    }

    if (prod.primary) {
      node.setAttribute('id', prod.id!);
    }

    if (utils.shouldInline(node)) {
      const cls = node.getAttribute('class') || '';

      if (cls.indexOf('inline') === -1) {
        node.setAttribute('class', cls + ' inline');
      }
    }
  }

  static elements = ['EMU-PRODUCTION'];
}
