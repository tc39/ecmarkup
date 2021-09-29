import type Note from './Note';
import type Example from './Example';
import type Spec from './Spec';
import type { PartialBiblioEntry } from './Biblio';
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
  type: string | null;
  notes: Note[];
  editorNotes: Note[];
  examples: Example[];
  effects: string[];

  constructor(spec: Spec, node: HTMLElement, parent: Clause, number: string) {
    super(spec, node);
    this.parentClause = parent;
    this.id = node.getAttribute('id')!;
    this.number = number;
    this.subclauses = [];
    this.notes = [];
    this.editorNotes = [];
    this.examples = [];
    this.effects = [];

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

    this.type = node.getAttribute('type');
    if (this.type === '') {
      this.type = null;
    }

    let header = this.node.firstElementChild;
    while (header != null && header.tagName === 'SPAN' && header.children.length === 0) {
      // skip oldids
      header = header.nextElementSibling;
    }
    if (header == null) {
      this.spec.warn({
        type: 'node',
        ruleId: 'missing-header',
        message: `could not locate header element`,
        node: this.node,
      });
      header = null;
    } else if (header.tagName !== 'H1') {
      this.spec.warn({
        type: 'node',
        ruleId: 'missing-header',
        message: `could not locate header element; found <${header.tagName.toLowerCase()}> before any <h1>`,
        node: header,
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

    const type = this.type;

    const { name, formattedHeader, formattedParams } = parseStructuredHeaderH1(this.spec, header);
    if (type === 'numeric method' && name != null && !name.includes('::')) {
      this.spec.warn({
        type: 'contents',
        ruleId: 'numeric-method-for',
        message: 'numeric methods should be of the form `Type::operation`',
        node: header,
        nodeRelativeLine: 1,
        nodeRelativeColumn: 1,
      });
    }
    if (type === 'sdo' && (formattedHeader ?? header.innerHTML).includes('(')) {
      // SDOs are rendered without parameter lists in the header, for the moment
      const currentHeader = formattedHeader ?? header.innerHTML;
      header.innerHTML = (
        currentHeader.substring(0, currentHeader.indexOf('(')) +
        currentHeader.substring(currentHeader.lastIndexOf(')') + 1)
      ).trim();
      if (
        header.children.length === 1 &&
        ['INS', 'DEL', 'MARK'].includes(header.children[0].tagName)
      ) {
        header.children[0].innerHTML = header.children[0].innerHTML.trim();
      }
    } else if (formattedHeader != null) {
      header.innerHTML = formattedHeader;
    }

    const { description, for: _for, effects } = parseStructuredHeaderDl(this.spec, type, dl);

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
        message: `nodes with structured headers should not include an AOID`,
        node: this.node,
        attr: 'aoid',
      });
    } else if (
      name != null &&
      type != null &&
      [
        'abstract operation',
        'sdo',
        'syntax-directed operation',
        'host-defined abstract operation',
        'implementation-defined abstract operation',
        'numeric method',
      ].includes(type)
    ) {
      this.node.setAttribute('aoid', name);
      this.aoid = name;
    }

    this.effects = effects;
    for (const effect of effects) {
      if (!this.spec._effectWorklist.has(effect)) {
        this.spec._effectWorklist.set(effect, []);
      }
      this.spec._effectWorklist.get(effect)!.push(this);
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

  isEffectApplicable(effectName: string) {
    // The following effects are runtime only:
    //
    // user-code: Only runtime can call user code.
    if (this.type === 'static sdo') {
      if (effectName === 'user-code') return false;
    }
    return true;
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
      const headerClone = header.cloneNode(true) as Element;
      for (const a of headerClone.querySelectorAll('a')) {
        a.replaceWith(...a.childNodes);
      }
      clause.titleHTML = headerClone.innerHTML;
      clause.title = headerClone.textContent;
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

    const attributes = [];
    if (node.hasAttribute('normative-optional')) {
      attributes.push('Normative Optional');
    }
    if (node.hasAttribute('legacy')) {
      attributes.push('Legacy');
    }
    if (attributes.length > 0) {
      const tag = spec.doc.createElement('div');
      tag.className = 'clause-attributes-tag';
      const text = attributes.join(', ');
      const contents = spec.doc.createTextNode(text);
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
    const entry: PartialBiblioEntry = {
      type: 'clause',
      id: clause.id,
      aoid: clause.aoid,
      title: clause.title!,
      titleHTML: clause.titleHTML,
      number: clause.number,
    };

    if (clause.aoid) {
      const existing = spec.biblio.keysForNamespace(spec.namespace);
      if (existing.has(clause.aoid)) {
        spec.warn({
          type: 'node',
          node,
          ruleId: 'duplicate-definition',
          message: `duplicate definition ${JSON.stringify(clause.aoid)}`,
        });
      }
    }
    spec.biblio.add(entry, spec.namespace);

    clauseStack.pop();
  }

  static elements = ['EMU-INTRO', 'EMU-CLAUSE', 'EMU-ANNEX'];
  static linkElements = Clause.elements;
}
