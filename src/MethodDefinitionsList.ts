import type Spec from './Spec';
import type { Context } from './Context';

import Builder from './Builder';
import type Clause from './Clause';
import Xref from './Xref';
import type { ClauseBiblioEntry } from './Biblio';

// Builds the list of definitions rendered inside an `<emu-concrete-method-dfns>` or
// `<emu-internal-method-dfns>` element: a bulleted list of xrefs pointing at each clause which
// defines the method named by the `for` attribute. Concrete and internal methods are indexed
// together in the biblio (see `byMethodAoid`), so a single builder handles both elements.
export default class MethodDefinitionsList extends Builder {
  static readonly elements = ['EMU-CONCRETE-METHOD-DFNS', 'EMU-INTERNAL-METHOD-DFNS'] as const;

  private _for: string;
  private _parentClause: Clause;

  constructor(spec: Spec, node: HTMLElement, _for: string, parentClause: Clause) {
    super(spec, node);
    this._for = _for;
    this._parentClause = parentClause;
  }

  static async enter({ node, spec, clauseStack }: Context) {
    const _for = node.getAttribute('for')!;
    const parentClause = clauseStack[clauseStack.length - 1];

    spec._methodDefinitionsLists.push(new MethodDefinitionsList(spec, node, _for, parentClause));
  }

  build() {
    const { spec, _parentClause: parentClause } = this;
    const namespace = parentClause ? parentClause.namespace : spec.namespace;

    const definitions = spec.biblio.byMethodAoid(this._for, namespace) ?? [];

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
