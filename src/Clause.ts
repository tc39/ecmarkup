import type Note from './Note';
import type Example from './Example';
import type Spec from './Spec';
import type { ClauseBiblioEntry } from './Biblio';
import type { Context } from './Context';

import Builder from './Builder';

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
    let dl = header.nextElementSibling;
    if (dl == null || dl.tagName !== 'DL' || !dl.classList.contains('header')) {
      return;
    }
    // if we find such a DL, treat this as a structured header

    let type = this.node.getAttribute('type') ?? 'unknown';
    this.node.removeAttribute('type'); // TODO maybe leave it in; this is just to minimize the diff

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
      switch (dtype.trim()) {
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
          if (_for != null) {
            this.spec.warn({
              type: 'node',
              ruleId: 'header-format',
              message: `duplicate "for" attribute"`,
              node: dd,
            });
          }
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
        // TODO drop these
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

    // parsing is intentionally permissive; the linter can do stricter checks
    // TODO have the linter do checks
    let headerText = header.innerHTML;
    let prefix = headerText.match(/^\s*(Static|Runtime) Semantics:\s*/);
    if (prefix != null) {
      headerText = headerText.substring(prefix[0].length);
    }

    let parsed = headerText.match(/^\s*([^(\s]+)\s*\((.*)\)\s*$/s);
    if (parsed == null) {
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
      }
      let formattedprefix = prefix == null ? '' : prefix[0].trim() + ' ';
      let formattedHeader = `${formattedprefix}${name} (${params.map(n => ' ' + n.name).join(',')}`;
      if (optionalParams.length > 0) {
        formattedHeader +=
          optionalParams
            .map((p, i) => ' [ ' + (i > 0 || params.length > 0 ? ', ' : '') + p.name)
            .join('') + optionalParams.map(() => ' ]').join('');
      }
      formattedHeader += ' )';
      header.innerHTML = formattedHeader;
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
    let formattedParams = '';
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
    let paras = [para];
    switch (type) {
      case 'numeric method': {
        if (!name.includes('::')) {
          this.spec.warn({
            type: 'contents',
            ruleId: 'numberic-method-for',
            message: `numeric methods should be of the form \`Type::operation\``,
            node: dl,
            nodeRelativeLine: 1,
            nodeRelativeColumn: 1,
          });
        }
      }
      // fall through
      case 'abstract operation': {
        // TODO tests (for each type of parametered thing) which have HTML in the parameter type
        para.innerHTML += `The abstract operation ${name} takes ${formattedParams}.`;
        break;
      }
      case 'host-defined abstract operation': {
        para.innerHTML += `The host-defined abstract operation ${name} takes ${formattedParams}.`;
        break;
      }
      case 'implementation-defined abstract operation': {
        para.innerHTML += `The implementation-defined abstract operation ${name} takes ${formattedParams}.`;
        break;
      }
      case 'internal method':
      case 'concrete method': {
        let word = type === 'internal method' ? 'internal' : 'concrete';
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
        if (type === 'unknown') {
          this.spec.warn({
            type: 'node',
            ruleId: 'header-type',
            message: `clauses with structured headers should have a type`,
            node: this.node,
          });
        } else {
          this.spec.warn({
            type: 'attr',
            ruleId: 'header-type',
            message: `unknown clause type ${type}`,
            node: this.node,
            attr: 'type',
          });
        }
      }
    }
    if (description != null) {
      // @ts-ignore childNodes is iterable
      let isJustElements = [...(description.childNodes as Iterable<Node>)].every(
        n => n.nodeType === 1 || (n.nodeType === 3 && n.textContent?.trim() === '')
      );
      if (isJustElements) {
        // @ts-ignore childNodes is iterable
        paras.push(...description.childNodes);
      } else {
        // @ts-ignore childNodes is iterable
        para.append(' ', ...description.childNodes);
      }
    }
    let next = dl.nextElementSibling;
    while (next != null && next.tagName === 'EMU-NOTE') {
      next = next.nextElementSibling;
    }
    if (next?.tagName == 'EMU-ALG' && !next.hasAttribute('replaces-step')) {
      if (paras.length > 1 || next !== dl.nextElementSibling) {
        let whitespace = next.previousSibling;
        let after = this.spec.doc.createElement('p');
        after.append('It performs the following steps when called:');
        next.parentElement!.insertBefore(after, next);

        // fix up the whitespace in the generated HTML
        if (whitespace?.nodeType === 3 /* TEXT_NODE */ && /^\s+$/.test(whitespace.nodeValue!)) {
          next.parentElement!.insertBefore(whitespace.cloneNode(), next);
        }
      } else {
        para.append(' It performs the following steps when called:');
      }
    }
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

    let header = clause.header;
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
