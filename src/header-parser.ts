import type Spec from './Spec';
import { offsetToLineAndColumn, validateEffects } from './utils';

export function parseStructuredHeaderH1(
  spec: Spec,
  header: Element
): { name: string | null; formattedHeader: string | null; formattedParams: string | null } {
  // parsing is intentionally permissive; the linter can do stricter checks
  // TODO have the linter do checks

  let wrapper = null;
  let headerText = header.innerHTML;
  let beforeContents = 0;
  const headerWrapperMatch = headerText.match(
    /^(?<beforeContents>\s*<(?<tag>ins|del|mark)>)(?<contents>.*)<\/\k<tag>>\s*$/is
  );
  if (headerWrapperMatch != null) {
    wrapper = headerWrapperMatch.groups!.tag;
    headerText = headerWrapperMatch.groups!.contents;
    beforeContents = headerWrapperMatch.groups!.beforeContents.length;
  }

  const prefix = headerText.match(/^\s*(Static|Runtime) Semantics:\s*/);
  if (prefix != null) {
    headerText = headerText.substring(prefix[0].length);
  }

  const parsed = headerText.match(
    /^(?<beforeParams>\s*(?<name>[^(\s]+)\s*)(?:\((?<params>.*)\)\s*)?$/s
  );
  if (parsed == null) {
    spec.warn({
      type: 'contents',
      ruleId: 'header-format',
      message: `failed to parse header`,
      node: header,
      nodeRelativeColumn: 1,
      nodeRelativeLine: 1,
    });
    return { name: null, formattedHeader: null, formattedParams: null };
  }

  type Param = { name: string; type: string | null; wrapper: string | null };
  const name = parsed.groups!.name;
  let paramText = parsed.groups!.params ?? '';
  const params: Array<Param> = [];
  const optionalParams: Array<Param> = [];
  let formattedHeader = null;

  if (/\(\s*\n/.test(headerText)) {
    // if it's multiline, parse it for types
    const paramLines = paramText.split('\n');
    let index = 0;
    let offset = 0;
    for (const line of paramLines) {
      offset += line.length;
      let chunk = line.trim();
      if (chunk === '') {
        continue;
      }
      const wrapperMatch = chunk.match(/^<(ins|del|mark)>(.*)<\/\1>$/i);
      let paramWrapper = null;
      if (wrapperMatch != null) {
        paramWrapper = wrapperMatch[1];
        chunk = wrapperMatch[2];
      }
      ++index;
      function getParameterOffset() {
        return (
          beforeContents +
          (prefix?.[0].length ?? 0) +
          parsed!.groups!.beforeParams.length +
          1 + // `beforeParams` does not include the leading `(`
          (offset - line.length) + // we've already updated offset to include line.length at this point
          index + // to account for the `\n`s eaten by the .split
          line.match(/^\s*/)![0].length
        );
      }
      const parsedChunk = chunk.match(/^(optional\s+)?([A-Za-z0-9_]+)\s*:\s*(\S.*\S)/);
      if (parsedChunk == null) {
        const { line: nodeRelativeLine, column: nodeRelativeColumn } = offsetToLineAndColumn(
          header.innerHTML,
          getParameterOffset()
        );
        spec.warn({
          type: 'contents',
          ruleId: 'header-format',
          message: `failed to parse parameter ${index}`,
          node: header,
          nodeRelativeColumn,
          nodeRelativeLine,
        });
        continue;
      }
      const optional = parsedChunk[1] != null;
      const paramName = parsedChunk[2];
      let paramType = parsedChunk[3];
      if (paramType.endsWith(',')) {
        paramType = paramType.slice(0, -1);
      }
      if (!optional && optionalParams.length > 0) {
        const { line: nodeRelativeLine, column: nodeRelativeColumn } = offsetToLineAndColumn(
          header.innerHTML,
          getParameterOffset()
        );
        spec.warn({
          type: 'contents',
          ruleId: 'header-format',
          message: `required parameters should not follow optional parameters`,
          node: header,
          nodeRelativeColumn,
          nodeRelativeLine,
        });
      }
      (optional ? optionalParams : params).push({
        name: paramName,
        type: paramType === 'unknown' ? null : paramType,
        wrapper: paramWrapper,
      });
    }
    const formattedPrefix = prefix == null ? '' : prefix[0].trim() + ' ';
    // prettier-ignore
    const printParam = (p: Param) => ` ${p.wrapper == null ? '' : `<${p.wrapper}>`}${p.name}${p.wrapper == null ? '' : `</${p.wrapper}>`}`;
    formattedHeader = `${formattedPrefix}${name} (${params.map(printParam).join(',')}`;
    if (optionalParams.length > 0) {
      formattedHeader +=
        optionalParams
          .map((p, i) => ' [ ' + (i > 0 || params.length > 0 ? ', ' : '') + p.name)
          .join('') + optionalParams.map(() => ' ]').join('');
    }
    formattedHeader += ' )';
  } else {
    let optional = false;
    paramText = paramText.trim();
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
          message: `failed to parse header`,
          node: header,
          // we could be more precise, but it's probably not worth the effort
          nodeRelativeLine: 1,
          nodeRelativeColumn: 1,
        });
        break;
      }
      paramText = text;
      (optional ? optionalParams : params).push({ name: match![1], type: null, wrapper: null });
      ({ success, text } = eat(paramText, /^(\s*\])+|,/));
      if (success) {
        paramText = text;
      }
    }
  }

  // prettier-ignore
  const printParamWithType = (p: Param) => `${p.wrapper == null ? '' : `<${p.wrapper}>`}${p.name}${p.type == null ? '' : ` (${p.type})`}${p.wrapper == null ? '' : `</${p.wrapper}>`}`;
  const paramsWithTypes = params.map(printParamWithType);
  const optionalParamsWithTypes = optionalParams.map(printParamWithType);
  let formattedParams = '';
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

  if (formattedHeader != null && wrapper != null) {
    formattedHeader = `<${wrapper}>${formattedHeader}</${wrapper}>`;
  }

  return { name, formattedHeader, formattedParams };
}

export function parseStructuredHeaderDl(
  spec: Spec,
  type: string | null,
  dl: Element
): { description: Element | null; for: Element | null; effects: string[] } {
  let description = null;
  let _for = null;
  let effects: string[] = [];
  for (let i = 0; i < dl.children.length; ++i) {
    const dt = dl.children[i];
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
    const dd = dl.children[i];
    if (dd?.tagName !== 'DD') {
      spec.warn({
        type: 'node',
        ruleId: 'header-format',
        message: `expecting header to have DD, but found ${dd.tagName}`,
        node: dd,
      });
      break;
    }

    const dtype = dt.textContent ?? '';
    switch (dtype.trim().toLowerCase()) {
      case 'description': {
        if (description != null) {
          spec.warn({
            type: 'node',
            ruleId: 'header-format',
            message: `duplicate "description" attribute`,
            node: dt,
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
            message: `duplicate "for" attribute`,
            node: dt,
          });
        }
        if (type === 'concrete method' || type === 'internal method') {
          _for = dd;
        } else {
          spec.warn({
            type: 'node',
            ruleId: 'header-format',
            message: `"for" attributes only apply to concrete or internal methods`,
            node: dt,
          });
        }
        break;
      }
      case 'effects': {
        // The dd contains a comma-separated list of effects.
        if (dd.textContent !== null) {
          effects = validateEffects(spec, dd.textContent.split(',').map(c => c.trim()), dd);
        }
        break;
      }
      case '': {
        spec.warn({
          type: 'node',
          ruleId: 'header-format',
          message: `missing value for structured header attribute`,
          node: dt,
        });
        break;
      }
      default: {
        spec.warn({
          type: 'node',
          ruleId: 'header-format',
          message: `unknown structured header entry type ${JSON.stringify(dtype)}`,
          node: dt,
        });
        break;
      }
    }
  }
  return { description, for: _for, effects };
}

export function formatPreamble(
  spec: Spec,
  clause: Element,
  dl: Element,
  type: string | null,
  name: string,
  formattedParams: string,
  _for: Element | null,
  description: Element | null
): Array<Element> {
  const para = spec.doc.createElement('p');
  const paras = [para];
  type = (type ?? '').toLowerCase();
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
    case 'sdo':
    case 'syntax-directed operation': {
      para.innerHTML += `The syntax-directed operation ${name} takes ${formattedParams}.`;
      break;
    }
    case 'internal method':
    case 'concrete method': {
      if (_for == null) {
        spec.warn({
          type: 'contents',
          ruleId: 'header-format',
          message: `expected ${type} to have a "for"`,
          node: dl,
          nodeRelativeLine: 1,
          nodeRelativeColumn: 1,
        });
        _for = spec.doc.createElement('div');
      }
      para.append(`The ${name} ${type} of `, ..._for.childNodes);
      para.innerHTML += ` takes ${formattedParams}.`;
      break;
    }
    default: {
      if (type) {
        spec.warn({
          type: 'attr-value',
          ruleId: 'header-type',
          message: `unknown clause type ${JSON.stringify(type)}`,
          node: clause,
          attr: 'type',
        });
      } else {
        spec.warn({
          type: 'node',
          ruleId: 'header-type',
          message: `clauses with structured headers should have a type`,
          node: clause,
        });
      }
    }
  }
  if (description != null) {
    const isJustElements = [...description.childNodes].every(
      n => n.nodeType === 1 || (n.nodeType === 3 && n.textContent?.trim() === '')
    );
    if (isJustElements) {
      paras.push(...(description.childNodes as Iterable<HTMLParagraphElement>));
    } else {
      para.append(' ', ...description.childNodes);
    }
  }
  const isSdo = type === 'sdo' || type === 'syntax-directed operation';
  const lastSentence = isSdo
    ? 'It is defined piecewise over the following productions:'
    : 'It performs the following steps when called:';
  let next = dl.nextElementSibling;
  while (next != null && next.tagName === 'EMU-NOTE') {
    next = next.nextElementSibling;
  }
  if (
    (isSdo && next?.tagName === 'EMU-GRAMMAR') ||
    (!isSdo && next?.tagName === 'EMU-ALG' && !next.hasAttribute('replaces-step'))
  ) {
    if (paras.length > 1 || next !== dl.nextElementSibling) {
      const whitespace = next.previousSibling;
      const after = spec.doc.createElement('p');
      after.append(lastSentence);
      next.parentElement!.insertBefore(after, next);

      // fix up the whitespace in the generated HTML
      if (whitespace?.nodeType === 3 /* TEXT_NODE */ && /^\s+$/.test(whitespace.nodeValue!)) {
        next.parentElement!.insertBefore(whitespace.cloneNode(), next);
      }
    } else {
      para.append(' ' + lastSentence);
    }
  }
  return paras;
}

function eat(text: string, regex: RegExp) {
  const match = text.match(regex);
  if (match == null) {
    return { success: false, match, text };
  }
  return { success: true, match, text: text.substring(match[0].length) };
}

function formatEnglishList(list: Array<string>) {
  if (list.length === 0) {
    throw new Error('formatEnglishList should not be called with an empty list');
  }
  if (list.length === 1) {
    return list[0];
  }
  if (list.length === 2) {
    return `${list[0]} and ${list[1]}`;
  }
  return `${list.slice(0, -1).join(', ')}, and ${list[list.length - 1]}`;
}
