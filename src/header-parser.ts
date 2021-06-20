import type Spec from './Spec';

export function parseStructuredHeaderH1(
  spec: Spec,
  header: Element
): { name: string | null; formattedHeader: string | null; formattedParams: string | null } {
  // parsing is intentionally permissive; the linter can do stricter checks
  // TODO have the linter do checks
  let headerText = header.innerHTML;
  let prefix = headerText.match(/^\s*(Static|Runtime) Semantics:\s*/);
  if (prefix != null) {
    headerText = headerText.substring(prefix[0].length);
  }

  let formattedHeader = null;
  let formattedParams = null;

  let parsed = headerText.match(/^\s*([^(\s]+)\s*\((.*)\)\s*$/s);
  if (parsed == null) {
    spec.warn({
      type: 'contents',
      ruleId: 'header-format',
      message: `failed to parse header`,
      node: header,
      nodeRelativeColumn: 1,
      nodeRelativeLine: 1,
    });
    return { name: null, formattedHeader, formattedParams };
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
        spec.warn({
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
    formattedHeader = `${formattedprefix}${name} (${params.map(n => ' ' + n.name).join(',')}`;
    if (optionalParams.length > 0) {
      formattedHeader +=
        optionalParams
          .map((p, i) => ' [ ' + (i > 0 || params.length > 0 ? ', ' : '') + p.name)
          .join('') + optionalParams.map(() => ' ]').join('');
    }
    formattedHeader += ' )';
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
        spec.warn({
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
  formattedParams = '';
  if (params.length === 0 && optionalParams.length === 0) {
    formattedParams = 'no arguments';
  } else {
    if (params.length > 0) {
      formattedParams =
        (params.length === 1 ? 'argument' : 'arguments') + ' ' + formatEnglishList(paramsWithTypes);
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

  return { name, formattedHeader, formattedParams };
}

export function parseStructuredHeaderDl(
  spec: Spec,
  type: string,
  dl: Element
): { description: Element | null; for: Element | null } {
  let description = null;
  let _for = null;
  for (let i = 0; i < dl.children.length; ++i) {
    let dt = dl.children[i];
    if (dt.tagName !== 'DT') {
      spec.warn({
        type: 'node',
        ruleId: 'header-format',
        message: `expecting header to have DT, but found ${dt.tagName}`,
        node: dt,
      });
      break;
    }
    ++i;
    let dd = dl.children[i];
    if (dd?.tagName !== 'DD') {
      spec.warn({
        type: 'node',
        ruleId: 'header-format',
        message: `expecting header to have DD, but found ${dd.tagName}`,
        node: dd,
      });
      break;
    }

    let dtype = dt.textContent ?? '';
    switch (dtype.trim()) {
      case 'description': {
        if (description != null) {
          spec.warn({
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
          spec.warn({
            type: 'node',
            ruleId: 'header-format',
            message: `duplicate "for" attribute"`,
            node: dd,
          });
        }
        if (type === 'concrete method' || type === 'internal method') {
          _for = dd;
        } else {
          spec.warn({
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
        spec.warn({
          type: 'node',
          ruleId: 'header-format',
          message: `unknown structured header entry type ${dtype}`,
          node: dd,
        });
        break;
      }
    }
  }
  return { description, for: _for };
}

export function formatPreamble(
  spec: Spec,
  clause: Element,
  dl: Element,
  type: string,
  name: string,
  formattedParams: string,
  _for: Element | null,
  description: Element | null
): Array<Element> {
  let para = spec.doc.createElement('p');
  let paras = [para];
  switch (type) {
    case 'numeric method':
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
        spec.warn({
          type: 'contents',
          ruleId: 'header-format',
          message: `expected ${word} method to have a "for"`,
          node: dl,
          nodeRelativeLine: 1,
          nodeRelativeColumn: 1,
        });
        _for = spec.doc.createElement('div');
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
        spec.warn({
          type: 'node',
          ruleId: 'header-type',
          message: `clauses with structured headers should have a type`,
          node: clause,
        });
      } else {
        spec.warn({
          type: 'attr',
          ruleId: 'header-type',
          message: `unknown clause type ${type}`,
          node: clause,
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
      let after = spec.doc.createElement('p');
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
  return paras;
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
