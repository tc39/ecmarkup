import type Note from './Note';
import type Example from './Example';
import type Spec from './Spec';
import type { ClauseBiblioEntry } from './Biblio';
import type { Context } from './Context';

import Builder from './Builder';
import { offsetToLineAndColumn } from './utils';

/*@internal*/
export default class Clause extends Builder {
  id: string;
  namespace: string;
  parentClause: Clause;
  title: string;
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

    let { title, titleHTML } = this.buildHeader();
    this.title = title!;
    this.titleHTML = titleHTML;
  }

  buildHeader() {
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
      return { title: 'UNKNOWN', titleHTML: 'UNKNOWN' };
    }

    this.buildStructuredHeader(header);

    let { textContent: title, innerHTML: titleHTML } = header;
    if (this.number) {
      const numElem = this.spec.doc.createElement('span');
      numElem.setAttribute('class', 'secnum');
      numElem.textContent = this.number;
      header.insertBefore(this.spec.doc.createTextNode(' '), header.firstChild);
      header.insertBefore(numElem, header.firstChild);
    }

    return { title, titleHTML };
  }

  buildStructuredHeader(header: Element) {
    let type = this.node.getAttribute('type');
    // if (
    //   ![
    //     'abstract operation',
    //     'host-defined abstract operation',
    //     'concrete method',
    //     'internal method',
    //   ].includes(type!)
    // ) {
    //   // TODO warn
    //   return;
    // }

    // TODO handle AOIDs

    let dl = header.nextElementSibling;
    if (dl == null || dl.tagName !== 'DL' || !dl.classList.contains('header')) {
      return;
    }
    // if we find such a DL, treat this as a structured header

    let description;
    let _for;
    for (let i = 0; i < dl.children.length; ++i) {
      let dt = dl.children[i];
      if (dt.tagName !== 'DT') {
        this.spec.warn({
          type: 'node',
          ruleId: 'header-format',
          message: `expecting header to have DT, but found ${dt.tagName}`,
          node: dt,
        });
        return;
      }
      ++i;
      let dd = dl.children[i];
      if (dd?.tagName !== 'DD') {
        this.spec.warn({
          type: 'node',
          ruleId: 'header-format',
          message: `expecting header to have DD, but found ${dd.tagName}`,
          node: dd,
        });
        return;
      }

      let dtype = dt.textContent ?? '';
      switch (dtype) {
        case 'op kind': {
          // TODO types should live in the attributes
          type = dd.textContent!;
          if (
            ['anonymous built-in function', 'function property', 'accessor property'].includes(type)
          ) {
            return;
          }
          if (
            ![
              'abstract operation',
              'host-defined abstract operation',
              'numeric method',
              'concrete method',
              'internal method',
            ].includes(type)
          ) {
            this.spec.warn({
              type: 'node',
              ruleId: 'header-format',
              message: `unknown operation type ${type}`,
              node: dd,
            });
            return;
          }
          break;
        }
        case 'description': {
          if (description != null) {
            this.spec.warn({
              type: 'node',
              ruleId: 'header-format',
              message: `duplicate description`,
              node: dd,
            });
          }
          description = dd;
          break;
        }
        case 'for': {
          if (type === 'concrete method' || type === 'internal method') {
            _for = dd;
          } else {
            this.spec.warn({
              type: 'node',
              ruleId: 'header-format',
              message: `"for" descriptions only apply to concrete or internal methods`,
              node: dd,
            });
          }
          break;
        }
        case 'parameters':
        case 'name':
        case 'returns':
        case 'also has access to': {
          break;
        }
        default: {
          this.spec.warn({
            type: 'node',
            ruleId: 'header-format',
            message: `unknown structured header entry type ${dtype}`,
            node: dd,
          });
          break;
        }
      }
    }

    // parsing is intentionally permissive; the linter imposes stricter checks
    // TODO have the linter do checks
    let headerText = header.innerHTML;
    let prefix = headerText.match(/^\s*(Static|Runtime) Semantics:\s*/);
    if (prefix != null) {
      headerText = headerText.substring(prefix[0].length);
    }
    let suffix = headerText.match(/\s*Concrete Method\s*$/);
    if (suffix != null) {
      headerText = headerText.substring(0, headerText.length - suffix[0].length);
    }

    let parsed = headerText.match(/^\s*([^(\s]+)\s*\(([^)]*)\)\s*$/);
    if (parsed == null) {
      // TODO deal with this properly
      this.spec.warn({
        type: 'contents',
        ruleId: 'header-format',
        message: `failed to parse header`,
        node: header,
        nodeRelativeColumn: 1,
        nodeRelativeLine: 1,
      });
      return;
    }

    type Param = { name: string; type: string | null };
    let name = parsed[1];
    let paramText = parsed[2].trim();
    let params: Array<Param> = [];
    let optionalParams: Array<Param> = [];

    if (/\(\s*\n/.test(headerText)) {
      // if it's multiline, parse it for types
      let paramChunks = paramText
        .split('\n')
        .map(c => c.trim())
        .filter(c => c.length > 1);
      let index = 0;
      for (let chunk of paramChunks) {
        ++index;
        // TODO linter enforces all optional params come after non-optional params
        let parsedChunk = chunk.match(/^(optional\s*)?([A-Za-z0-9_]+)\s*:\s*(\S.*\S)/);
        if (parsedChunk == null) {
          this.spec.warn({
            type: 'contents',
            ruleId: 'header-format',
            message: `failed to parse header (parameter ${index})`,
            node: header,
            nodeRelativeColumn: 1,
            nodeRelativeLine: 1,
          });
          continue;
        }
        let optional = parsedChunk[1] != null;
        let paramName = parsedChunk[2];
        let paramType = parsedChunk[3];
        if (paramType.endsWith(',')) {
          paramType = paramType.slice(0, -1);
        }
        (optional ? optionalParams : params).push({
          name: paramName,
          type: paramType === 'unknown' ? null : paramType,
        });
        let formattedHeader = name + ' ( ' + params.map(n => n.name).join(', ');
        if (optionalParams.length > 0) {
          formattedHeader += ' [ ';
          if (params.length > 0) {
            formattedHeader += ', ';
          }
          formattedHeader += optionalParams.map(p => p.name).join(', ') + ' ]';
        }
        formattedHeader += ' )';
        header.innerHTML = formattedHeader;
      }
    } else {
      let optional = false;
      while (true) {
        if (paramText.length == 0) {
          break;
        }
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        let { success, text, match } = eat(paramText, /^\s*\[(\s*,)?/);
        if (success) {
          optional = true;
          paramText = text;
        }
        ({ success, text, match } = eat(paramText, /^\s*([A-Za-z0-9_]+)/));
        if (!success) {
          this.spec.warn({
            type: 'contents',
            ruleId: 'header-format',
            message: `could not parse header`,
            node: header,
            // we could be more precise, but it's probably not worth the effort
            nodeRelativeLine: 1,
            nodeRelativeColumn: 1,
          });
          break;
        }
        paramText = text;
        (optional ? optionalParams : params).push({ name: match![1], type: null });
        ({ success, text } = eat(paramText, /^(\s*\])+|,/));
        if (success) {
          paramText = text;
        }
      }
    }

    let printParam = (p: Param) => `${p.name}${p.type == null ? '' : ` (${p.type})`}`;
    let paramsWithTypes = params.map(printParam);
    let optionalParamsWithTypes = optionalParams.map(printParam);
    let formattedParams;
    if (params.length === 0 && optionalParams.length === 0) {
      formattedParams = 'no arguments';
    } else {
      if (params.length > 0) {
        formattedParams =
          (params.length === 1 ? 'argument' : 'arguments') +
          ' ' +
          formatEnglishList(paramsWithTypes);
        if (optionalParams.length > 0) {
          formattedParams += ' and ';
        }
      }
      if (optionalParams.length > 0) {
        formattedParams +=
          'optional ' +
          (optionalParams.length === 1 ? 'argument' : 'arguments') +
          ' ' +
          formatEnglishList(optionalParamsWithTypes);
      }
    }

    let para = this.spec.doc.createElement('p');
    switch (type) {
      case 'abstract operation':
      case 'numeric method': {
        // TODO numeric methods should enforce that the name contains `::`
        // TODO tests (for each type of parametered thing) which have HTML in the parameter type
        para.innerHTML += `The abstract operation ${name} takes ${formattedParams}.`;
        break;
      }
      case 'host-defined abstract operation': {
        // TODO maybe a property instead?
        para.innerHTML += `The host-defined abstract operation ${name} takes ${formattedParams}.`;
        break;
      }
      case 'internal method':
      case 'concrete method': {
        let word = type === 'internal method' ? 'interal' : 'concrete';
        if (_for == null) {
          this.spec.warn({
            type: 'contents',
            ruleId: 'header-format',
            message: `expected ${word} method to have a "for"`,
            node: dl,
            nodeRelativeLine: 1,
            nodeRelativeColumn: 1,
          });
          _for = this.spec.doc.createElement('div');
        }
        para.append(
          `The ${name} ${word} method of `,
          // @ts-ignore childNodes is iterable
          ..._for.childNodes
        );
        para.innerHTML += ` takes ${formattedParams}.`;
        break;
      }
      default: {
        throw new Error(`unreachable: clause type ${type}`);
      }
    }
    if (description != null) {
      // @ts-ignore childNodes is iterable
      para.append(' ', ...description.childNodes);
    }
    let next = dl.nextElementSibling;
    while (next != null && next.tagName === 'EMU-NOTE') {
      next = next.nextElementSibling;
    }
    if (next?.tagName == 'EMU-ALG') {
      para.append(' It performs the following steps when called:');
    }
    dl.replaceWith(para);
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
      title: clause.title,
      titleHTML: clause.titleHTML,
      number: clause.number,
      referencingIds: [],
    };
    spec.biblio.add(entry, spec.namespace);

    clauseStack.pop();
  }

  static elements = ['EMU-INTRO', 'EMU-CLAUSE', 'EMU-ANNEX'];
  static linkElements = Clause.elements;
}

function eat(text: string, regex: RegExp) {
  let match = text.match(regex);
  if (match == null) {
    return { success: false, match, text };
  }
  return { success: true, match, text: text.substring(match[0].length) };
}

function formatEnglishList(list: Array<string>) {
  if (list.length === 1) {
    return list[0];
  }
  if (list.length === 2) {
    return `${list[0]} and ${list[1]}`;
  }
  return `${list.slice(0, -1).join(', ')}, and ${list[list.length - 1]}`;
}
