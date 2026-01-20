import type Spec from './Spec';
import type { Context } from './Context';

import Builder from './Builder';
import type Clause from './Clause';
import Xref from './Xref';
import type { ClauseBiblioEntry } from './Biblio';

export default class ConcreteMethodDfns extends Builder {
  static readonly elements = ['EMU-CONCRETE-METHOD-DFNS'] as const;

  private _clauses: Clause[];
  private _for: string;
  private _parentClause: Clause;

  constructor(spec: Spec, node: HTMLElement, _for: string, parentClause: Clause) {
    super(spec, node);
    this._clauses = [];
    this._for = _for;
    this._parentClause = parentClause;
  }

  static async enter({ node, spec, clauseStack }: Context) {
    const _for = node.getAttribute('for')!;
    const parentClause = clauseStack[clauseStack.length - 1];

    const concreteMethodDfns = new ConcreteMethodDfns(spec, node, _for, parentClause);
    spec._concreteMethodDfnsLists.push(concreteMethodDfns);
  }

  build() {
    const { spec, _parentClause: parentClause } = this;
    const namespace = parentClause ? parentClause.namespace : spec.namespace;

    const definitions = spec.biblio.byAbstractMethodAoid(this._for, namespace) ?? [];

    const ul = spec.doc.createElement('ul');

    for (const def of definitions) {
      const id = def.id ?? def.refId!;
      const declaration = spec.biblio.byId(id) as ClauseBiblioEntry;

      const li = spec.doc.createElement('li');
      const xrefNode = spec.doc.createElement('emu-xref');
      xrefNode.setAttribute('href', `#${id}`);
      xrefNode.textContent = `${declaration.number} ${def.for}`;
      li.appendChild(xrefNode);
      ul.appendChild(li);

      const xref = new Xref(
        spec,
        xrefNode,
        parentClause,
        namespace,
        xrefNode.getAttribute('href')!,
        (null as null | string)!,
      );
      spec._xrefs.push(xref);
    }

    this.node.appendChild(ul);
  }
}
