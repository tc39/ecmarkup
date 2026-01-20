import type Spec from './Spec';
import type { Context } from './Context';

import { getHeaderSource, parsedHeaderToSignature } from './Clause';
import { formatHeader, parseHeader, warnAllErrors } from './header-parser';
import type { PartialBiblioEntry, Signature } from './Biblio';
import { ParseError } from './type-parser';
import { offsetToLineAndColumn, traverseWhile } from './utils';
import Figure from './Figure';

export default class Table extends Figure {
  table: HTMLTableElement;
  tableType: null | 'abstract methods';
  methods: Map<string, { signature: Signature; rowId: string | undefined }>;
  of: string | null = null;

  static elements = ['EMU-TABLE'];

  constructor(
    spec: Spec,
    node: HTMLElement,
    table: HTMLTableElement,
    tableType: null | 'abstract methods',
  ) {
    let of: string | null = null;
    if (tableType === 'abstract methods') {
      of = node.getAttribute('of');

      if (of) {
        if (!node.getAttribute('caption')) {
          node.setAttribute('caption', `Abstract Methods of ${of}`);
        }
      } else {
        spec.warn({
          type: 'node',
          ruleId: 'emu-abstract-methods-invalid',
          message: `<emu-table type="abstract methods"> must have an 'of' attribute`,
          node,
        });
        tableType = null;
      }
    }

    super(spec, node);

    this.table = table;
    this.tableType = tableType;
    this.of = of;
    this.methods = new Map();

    if (tableType === 'abstract methods') {
      this.processAbstractMethodsDeclarations();
      this.defineInnerBiblioEntries();
    }
  }

  private processAbstractMethodsDeclarations() {
    const { spec, table } = this;
    const tbody = table.querySelector('tbody')!;

    for (const tr of tbody.children as HTMLCollectionOf<HTMLTableRowElement>) {
      if (tr.childElementCount < 2) {
        spec.warn({
          type: 'node',
          ruleId: 'emu-abstract-methods-invalid',
          message: `<emu-table type="abstract methods"> <tr>s must contain at least two <td>s`,
          node: tr,
        });
        continue;
      }

      let header: Element | null = tr.firstElementChild as HTMLTableCellElement;
      const headerFirstChild = traverseWhile(
        header.firstChild,
        'nextSibling',
        el => el.textContent?.trim() === '',
      );
      if (headerFirstChild?.nodeName === 'DEL') {
        header = traverseWhile(
          headerFirstChild as Element,
          'nextElementSibling',
          node => node.nodeName === 'DEL',
        );
        if (!header) continue;
      } else if (headerFirstChild?.nodeName === 'INS') {
        header = headerFirstChild as Element;
      }
      if (header.nodeName !== 'TD' && header.nodeName !== 'INS') {
        this.spec.warn({
          type: 'node',
          ruleId: 'missing-header',
          message: `could not locate header element; found <${header.tagName.toLowerCase()}>`,
          node: header,
        });
        continue;
      }

      const headerSource = getHeaderSource(header, spec);
      const parseResult = parseHeader(headerSource);

      if (parseResult.type === 'failure') {
        warnAllErrors(spec, header, parseResult);
        continue;
      }

      let signature: Signature;
      try {
        signature = parsedHeaderToSignature(parseResult);
      } catch (e) {
        if (e instanceof ParseError) {
          const { line, column } = offsetToLineAndColumn(headerSource, e.offset);
          spec.warn({
            type: 'contents',
            ruleId: 'type-parsing',
            message: e.message,
            node: header,
            nodeRelativeLine: line,
            nodeRelativeColumn: column,
          });
          continue;
        } else {
          throw e;
        }
      }

      const rowId = tr.id || undefined;
      if (tbody.children.length > 1 && !rowId) {
        spec.warn({
          type: 'node',
          ruleId: 'abstract-method-id',
          message: '<tr>s which define abstract methods should have their own id',
          node: tr,
        });
      }

      this.methods.set(parseResult.name, { signature, rowId });

      const { name, formattedHeader, formattedParams, formattedReturnType } = formatHeader(
        spec,
        header,
        parseResult,
      );
      if (formattedHeader !== null) header.innerHTML = formattedHeader;

      const para = spec.doc.createElement('p');
      let paraText = `The abstract method ${name} takes ${formattedParams} and returns ${formattedReturnType}.`;
      if (header.nodeName === 'INS') paraText = `<ins>${paraText}</ins>`;
      para.innerHTML = paraText;
      tr.children[1].insertBefore(para, tr.children[1].firstChild);
    }
  }

  defineInnerBiblioEntries() {
    for (const [name, info] of this.methods) {
      const { signature, rowId } = info;
      const biblioEntry: PartialBiblioEntry = {
        type: 'op',
        kind: 'abstract method',
        aoid: name,
        id: rowId,
        refId: this.id!,
        signature,
        effects: [],
      };
      this.spec.biblio.add(biblioEntry, this.spec.namespace);
    }
  }

  static async enter({ spec, node }: Context) {
    let tableType = node.getAttribute('type');

    if (tableType && tableType !== 'abstract methods') {
      spec.warn({
        type: 'node',
        ruleId: 'emu-table-invalid-type',
        message: `<emu-table> has invalid type "${tableType}"`,
        node,
      });
      tableType = null;
    }

    let tableEl = traverseWhile(
      node.firstElementChild,
      'nextElementSibling',
      el => el.nodeName === 'EMU-CAPTION' || (el.nodeName === 'SPAN' && el.textContent === ''), // skip generated elements
    )!;
    if (!tableEl || tableEl.nodeName !== 'TABLE') {
      if (tableType) {
        spec.warn({
          type: 'node',
          ruleId: 'emu-table-missing',
          message: `<emu-table type="${tableType}"> must contain a <table> element`,
          node,
        });
        tableType = null;
      } else {
        tableEl = spec.doc.createElement('table');
      }
    }

    const table = new Table(
      spec,
      node,
      tableEl as HTMLTableElement,
      tableType === 'abstract methods' ? 'abstract methods' : null,
    );

    Figure.injectFigureElement(spec, node, table);
  }
}
