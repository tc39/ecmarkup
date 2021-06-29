import type Note from './Note';
import type Example from './Example';
import type Spec from './Spec';
import type { ClauseBiblioEntry } from './Biblio';
import type { Context } from './Context';

import Builder from './Builder';
import { formatPreamble, parseStructuredHeaderDl, parseStructuredHeaderH1 } from './header-parser';

/*@internal*/
export default class Clause extends Builder {
  id: string;
  namespace: string;
  parentClause: Clause;
  header: Element | null;
  // @ts-ignore skipping the strictPropertyInitialization check
  title: string | null;
  // @ts-ignore skipping the strictPropertyInitialization check
  titleHTML: string;
  subclauses: Clause[];
  number: string;
  aoid: string | null;
  notes: Note[];
  editorNotes: Note[];
  examples: Example[];

  constructor(spec: Spec, node: HTMLElement, parent: Clause, number: string) {
    super(spec, node);
    this.parentClause = parent;
    this.id = node.getAttribute('id')!;
    this.number = number;
    this.subclauses = [];
    this.notes = [];
    this.editorNotes = [];
    this.examples = [];

    // namespace is either the entire spec or the parent clause's namespace.
    let parentNamespace = spec.namespace;
    if (parent) {
      parentNamespace = parent.namespace;
    }

    if (node.hasAttribute('namespace')) {
      this.namespace = node.getAttribute('namespace')!;
      spec.biblio.createNamespace(this.namespace, parentNamespace);
    } else {
      this.namespace = parentNamespace;
    }

    this.aoid = node.getAttribute('aoid');
    if (this.aoid === '') {
      // <emu-clause id=foo aoid> === <emu-clause id=foo aoid=foo>
      this.aoid = node.id;
    }

    let header = this.node.firstElementChild;
    while (header != null && header.tagName === 'SPAN' && header.children.length === 0) {
      // skip oldids
      header = header.nextElementSibling;
    }
    if (header == null || header.tagName !== 'H1') {
      this.spec.warn({
        type: 'node',
        ruleId: 'missing-header',
        message: `clause doesn't have a header, found: ${header?.tagName}`,
        node: this.node,
      });
      header = null;
    } else {
      this.buildStructuredHeader(header);
    }
    this.header = header;
  }

  buildStructuredHeader(header: Element) {
    const dl = header.nextElementSibling;
    if (dl == null || dl.tagName !== 'DL' || !dl.classList.contains('header')) {
      return;
    }
    // if we find such a DL, treat this as a structured header

    const type = this.node.getAttribute('type') ?? 'unknown';
    this.node.removeAttribute('type'); // TODO maybe leave it in; this is just to minimize the diff

    const { name, formattedHeader, formattedParams } = parseStructuredHeaderH1(this.spec, header);
    if (type === 'numeric method' && name != null && !name.includes('::')) {
      this.spec.warn({
        type: 'contents',
        ruleId: 'numberic-method-for',
        message: `numeric methods should be of the form \`Type::operation\``,
        node: dl,
        nodeRelativeLine: 1,
        nodeRelativeColumn: 1,
      });
    }
    if (formattedHeader != null) {
      header.innerHTML = formattedHeader;
    }

    const { description, for: _for } = parseStructuredHeaderDl(this.spec, type, dl);

    const paras = formatPreamble(
      this.spec,
      this.node,
      dl,
      type,
      name ?? 'UNKNOWN',
      formattedParams ?? 'UNPARSEABLE ARGUMENTS',
      _for,
      description
    );
    dl.replaceWith(...paras);

    if (this.node.hasAttribute('aoid')) {
      this.spec.warn({
        type: 'attr',
        ruleId: 'header-format',
        message: `nodes with formatted headers should not include an AOID`,
        node: this.node,
        attr: 'aoid',
      });
    } else if (
      name != null &&
      [
        'abstract operation',
        'host-defined abstract operation',
        'implementation-defined abstract operation',
        'numeric method',
      ].includes(type)
    ) {
      this.node.setAttribute('aoid', name);
      this.aoid = name;
    }
  }

  buildNotes() {
    if (this.notes.length === 1) {
      this.notes[0].build();
    } else {
      // pass along note index
      this.notes.forEach((note, i) => {
        note.build(i + 1);
      });
    }

    this.editorNotes.forEach(note => note.build());
  }

  buildExamples() {
    if (this.examples.length === 1) {
      this.examples[0].build();
    } else {
      // pass along example index
      this.examples.forEach((example, i) => {
        example.build(i + 1);
      });
    }
  }

  static async enter({ spec, node, clauseStack, clauseNumberer }: Context) {
    if (!node.id) {
      spec.warn({
        type: 'node',
        ruleId: 'missing-id',
        message: "clause doesn't have an id",
        node,
      });
    }

    let nextNumber = '';
    if (node.nodeName !== 'EMU-INTRO') {
      nextNumber = clauseNumberer.next(clauseStack.length, node.nodeName === 'EMU-ANNEX').value;
    }
    const parent = clauseStack[clauseStack.length - 1] || null;

    const clause = new Clause(spec, node, parent, nextNumber);

    if (parent) {
      parent.subclauses.push(clause);
    } else {
      spec.subclauses.push(clause);
    }

    clauseStack.push(clause);
  }

  static exit({ node, spec, clauseStack, inAlg, currentId }: Context) {
    const clause = clauseStack[clauseStack.length - 1];

    const header = clause.header;
    if (header == null) {
      clause.title = 'UNKNOWN';
      clause.titleHTML = 'UNKNOWN';
    } else {
      ({ textContent: clause.title, innerHTML: clause.titleHTML } = header);
      if (clause.number) {
        const numElem = clause.spec.doc.createElement('span');
        numElem.setAttribute('class', 'secnum');
        numElem.textContent = clause.number;
        header.insertBefore(clause.spec.doc.createTextNode(' '), header.firstChild);
        header.insertBefore(numElem, header.firstChild);
      }
    }

    clause.buildExamples();
    clause.buildNotes();

    if (node.hasAttribute('normative-optional')) {
      const tag = spec.doc.createElement('div');
      tag.className = 'normative-optional-tag';
      const contents = spec.doc.createTextNode('Normative Optional');
      tag.append(contents);
      node.prepend(tag);

      // we've already walked past the text node, so it won't get picked up by the usual process for autolinking
      spec._textNodes[clause.namespace] = spec._textNodes[clause.namespace] || [];
      spec._textNodes[clause.namespace].push({
        node: contents,
        clause,
        inAlg,
        currentId,
      });
    }

    // clauses are always at the spec-level namespace.
    const entry: ClauseBiblioEntry = {
      type: 'clause',
      id: clause.id,
      aoid: clause.aoid,
      title: clause.title!,
      titleHTML: clause.titleHTML!,
      number: clause.number,
      referencingIds: [],
    };
    spec.biblio.add(entry, spec.namespace);

    clauseStack.pop();
  }

  static elements = ['EMU-INTRO', 'EMU-CLAUSE', 'EMU-ANNEX'];
  static linkElements = Clause.elements;
}
