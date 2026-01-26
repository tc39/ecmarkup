import type Spec from './Spec';
import { offsetToLineAndColumn, validateEffects } from './utils';

type ParseError = {
  message: string;
  offset: number;
};
type BaseParam = {
  name: string;
  wrappingTag: 'ins' | 'del' | 'mark' | null;
};
export type Param = BaseParam &
  (
    | {
        type: null;
      }
    | {
        type: string;
        typeOffset: number;
      }
  );

type ParsedHeaderWithoutReturn = {
  type: 'single-line' | 'multi-line';
  wrappingTag: 'ins' | 'del' | 'mark' | null;
  prefix: string | null;
  name: string;
  params: Param[];
  optionalParams: Param[];
  returnType: string | null;
  errors: ParseError[];
};

export type ParsedHeader = ParsedHeaderWithoutReturn &
  ({ returnType: null } | { returnType: string; returnOffset: number });

export type ParsedHeaderOrFailure =
  | ParsedHeader
  | {
      type: 'failure';
      errors: ParseError[];
    };

export function parseHeader(headerText: string): ParsedHeaderOrFailure {
  let offset = 0;
  const errors: ParseError[] = [];

  let { match, text } = eat(headerText, /^\s*/);
  if (match) {
    offset += match[0].length;
  }

  let wrappingTag: 'ins' | 'del' | 'mark' | null = null;
  ({ match, text } = eat(text, /^<(ins|del|mark) *>\s*/i));
  if (match) {
    wrappingTag = match[1].toLowerCase().trimRight() as 'ins' | 'del' | 'mark';
    offset += match[0].length;
  }

  let prefix = null;
  ({ match, text } = eat(text, /^(Static|Runtime) Semantics:\s*/i));
  if (match) {
    prefix = match[0].trimRight();
    offset += match[0].length;
  }

  ({ match, text } = eat(text, /^[^(\s]+\s*/));
  if (!match) {
    errors.push({ message: 'could not find AO name', offset });
    return { type: 'failure', errors };
  }
  offset += match[0].length;
  const name = match[0].trimRight();

  if (text === '') {
    if (wrappingTag !== null) {
      if (text.endsWith(`</${wrappingTag}>`)) {
        text = text.slice(0, -(3 + wrappingTag.length));
      } else {
        errors.push({
          message: `could not find matching ${wrappingTag} tag`,
          offset,
        });
      }
    }
    return {
      type: 'single-line',
      prefix,
      name,
      wrappingTag,
      params: [],
      optionalParams: [],
      returnType: null,
      errors,
    };
  }

  ({ match, text } = eat(text, /^\( */));
  if (!match) {
    errors.push({ message: 'expected `(`', offset });
    return { type: 'failure', errors };
  }
  offset += match[0].length;

  let type: 'single-line' | 'multi-line';
  const params: Param[] = [];
  const optionalParams: Param[] = [];
  if (text[0] === '\n') {
    // multiline: parse for parameter types
    type = 'multi-line';
    ({ match, text } = eat(text, /^\s*/));
    offset += match![0].length;

    while (true) {
      ({ match, text } = eat(text, /^\)\s*/));
      if (match) {
        offset += match[0].length;
        break;
      }

      let paramWrappingTag: 'ins' | 'del' | 'mark' | null = null;
      ({ match, text } = eat(text, /^<(ins|del|mark) *>\s*/i));
      if (match) {
        paramWrappingTag = match[1].toLowerCase().trimRight() as 'ins' | 'del' | 'mark';
        offset += match[0].length;
      }

      let optional = false;
      ({ match, text } = eat(text, /^optional */i));
      if (match) {
        optional = true;
        offset += match[0].length;
      } else if (optionalParams.length > 0) {
        errors.push({
          message: 'required parameters should not follow optional parameters',
          offset,
        });
      }

      ({ match, text } = eat(text, /^[A-Za-z0-9_]+ */i));
      if (!match) {
        errors.push({ message: 'expected parameter name', offset });
        return { type: 'failure', errors };
      }
      offset += match[0].length;
      const paramName = match[0].trimRight();

      ({ match, text } = eat(text, /^:+ */i));
      if (!match) {
        errors.push({ message: 'expected `:`', offset });
        return { type: 'failure', errors };
      }
      offset += match[0].length;

      // TODO handle absence of type, treat as unknown

      const typeOffset = offset;
      ({ match, text } = eat(text, /^[^\n]+\n\s*/i));
      if (!match) {
        errors.push({ message: 'expected a type', offset });
        return { type: 'failure', errors };
      }
      offset += match[0].length;
      let paramType = match[0].trimRight();

      if (paramWrappingTag !== null) {
        if (paramType.endsWith(`</${paramWrappingTag}>`)) {
          paramType = paramType.slice(0, -(3 + paramWrappingTag.length));
        } else {
          errors.push({
            message: `could not find matching ${paramWrappingTag} tag`,
            offset,
          });
        }
      }

      if (paramType.endsWith(',')) {
        paramType = paramType.slice(0, -1);
      }

      const base = optional ? optionalParams : params;
      if (paramType === 'unknown') {
        base.push({
          name: paramName,
          type: null,
          wrappingTag: paramWrappingTag,
        });
      } else {
        base.push({
          name: paramName,
          type: paramType,
          typeOffset,
          wrappingTag: paramWrappingTag,
        });
      }
    }
  } else {
    // single line: no types
    type = 'single-line';

    let optional = false;
    while (true) {
      ({ match, text } = eat(text, /^\)\s*/));
      if (match) {
        offset += match[0].length;
        break;
      }
      ({ text, match } = eat(text, /^\[(\s*,)?\s*/));
      if (match) {
        optional = true;
        offset += match[0].length;
      }

      ({ text, match } = eat(text, /^([A-Za-z0-9_]+)\s*/));
      if (!match) {
        errors.push({ message: 'expected parameter name', offset });
        return { type: 'failure', errors };
      }
      offset += match[0].length;
      const paramName = match[0].trimRight();

      (optional ? optionalParams : params).push({
        name: paramName,
        type: null,
        wrappingTag: null,
      });
      ({ match, text } = eat(text, /^((\s*\])+|,)\s*/));
      if (match) {
        offset += match[0].length;
      }
    }
  }

  let returnOffset = 0;
  let returnType = null;
  ({ match, text } = eat(text, /^: */));
  if (match) {
    offset += match[0].length;
    returnOffset = offset;
    ({ match, text } = eat(text, /^(.*?)(?=<\/(ins|del|mark)>|$)/im));
    if (match) {
      returnType = match[1].trim();
      if (returnType === '') {
        errors.push({ message: 'if a return type is given, it must not be empty', offset });
        returnType = null;
      } else if (returnType === 'unknown') {
        returnType = null;
      }
      offset += match[0].length;
    }
  }
  if (wrappingTag !== null) {
    const trimmed = text.trimEnd();
    if (trimmed.endsWith(`</${wrappingTag}>`)) {
      text = trimmed.slice(0, -(3 + wrappingTag.length));
    } else {
      errors.push({
        message: `could not find matching ${wrappingTag} tag`,
        offset,
      });
    }
  }

  if (text.trim() !== '') {
    errors.push({
      message: 'unknown extra text in header',
      offset,
    });
  }

  if (returnType == null) {
    return {
      type,
      wrappingTag,
      prefix,
      name,
      params,
      optionalParams,
      returnType,
      errors,
    };
  } else {
    return {
      type,
      wrappingTag,
      prefix,
      name,
      params,
      optionalParams,
      returnType,
      returnOffset,
      errors,
    };
  }
}

const printParamWithType = (p: Param) => {
  let result = p.name;
  if (p.type !== null) {
    result += ` (${p.type})`;
  }
  if (p.wrappingTag !== null) {
    result = `<${p.wrappingTag}>${result}</${p.wrappingTag}>`;
  }
  return result;
};

export function printParam(p: Param) {
  if (p.wrappingTag !== null) {
    return `<${p.wrappingTag}>${p.name}</${p.wrappingTag}>`;
  }
  return p.name;
}

export function printSimpleParamList(params: Param[], optionalParams: Param[]) {
  let result = '(' + params.map(p => ' ' + printParam(p)).join(',');
  if (optionalParams.length > 0) {
    const formattedOptionalParams = optionalParams
      .map((p, i) => ' [ ' + (i > 0 || params.length > 0 ? ', ' : '') + printParam(p))
      .join('');
    result += formattedOptionalParams + optionalParams.map(() => ' ]').join('');
  }
  result += ' )';
  return result;
}

export function warnAllErrors(spec: Spec, header: Element, parseResult: ParsedHeaderOrFailure) {
  for (const { message, offset } of parseResult.errors) {
    const { line: nodeRelativeLine, column: nodeRelativeColumn } = offsetToLineAndColumn(
      header.innerHTML,
      offset,
    );
    spec.warn({
      type: 'contents',
      ruleId: 'header-format',
      message,
      node: header,
      nodeRelativeColumn,
      nodeRelativeLine,
    });
  }
}

export function formatHeader(
  spec: Spec,
  header: Element,
  parseResult: ParsedHeaderOrFailure,
): {
  name: string | null;
  formattedHeader: string | null;
  formattedParams: string | null;
  formattedReturnType: string | null;
} {
  warnAllErrors(spec, header, parseResult);
  if (parseResult.type === 'failure') {
    return { name: null, formattedHeader: null, formattedParams: null, formattedReturnType: null };
  }

  const {
    wrappingTag,
    prefix,
    name,
    params,
    optionalParams,
    returnType,
    // errors is already handled
  } = parseResult;

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

  let formattedHeader =
    (prefix == null ? '' : prefix + ' ') +
    name +
    ' ' +
    printSimpleParamList(params, optionalParams);

  if (wrappingTag !== null) {
    formattedHeader = `<${wrappingTag}>${formattedHeader}</${wrappingTag}>`;
  }

  return { name, formattedHeader, formattedParams, formattedReturnType: returnType };
}

export interface StructuredHeader {
  description: Element | null;
  for: Element | null;
  effects: string[];
  redefinition: boolean;
  skipGlobalChecks: boolean;
  skipReturnChecks: boolean;
}

export function parseStructuredHeaderDl(
  spec: Spec,
  type: string | null,
  dl: Element,
): StructuredHeader {
  let description = null;
  let _for = null;
  let redefinition: boolean | null = null;
  let effects: string[] = [];
  let skipGlobalChecks: boolean | null = null;
  let skipReturnChecks: boolean | null = null;
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
          effects = validateEffects(
            spec,
            dd.textContent.split(',').map(c => c.trim()),
            dd,
          );
        }
        break;
      }
      // TODO figure out how to de-dupe the code for boolean attributes
      case 'redefinition': {
        if (redefinition != null) {
          spec.warn({
            type: 'node',
            ruleId: 'header-format',
            message: `duplicate "redefinition" attribute`,
            node: dt,
          });
        }
        const contents = (dd.textContent ?? '').trim();
        if (contents === 'true') {
          redefinition = true;
        } else if (contents === 'false') {
          redefinition = false;
        } else {
          spec.warn({
            type: 'contents',
            ruleId: 'header-format',
            message: `unknown value for "redefinition" attribute (expected "true" or "false", got ${JSON.stringify(
              contents,
            )})`,
            node: dd,
            nodeRelativeLine: 1,
            nodeRelativeColumn: 1,
          });
        }
        break;
      }
      case 'skip global checks': {
        if (skipGlobalChecks != null) {
          spec.warn({
            type: 'node',
            ruleId: 'header-format',
            message: `duplicate "skip global checks" attribute`,
            node: dt,
          });
        }
        const contents = (dd.textContent ?? '').trim();
        if (contents === 'true') {
          skipGlobalChecks = true;
        } else if (contents === 'false') {
          skipGlobalChecks = false;
        } else {
          spec.warn({
            type: 'contents',
            ruleId: 'header-format',
            message: `unknown value for "skip global checks" attribute (expected "true" or "false", got ${JSON.stringify(
              contents,
            )})`,
            node: dd,
            nodeRelativeLine: 1,
            nodeRelativeColumn: 1,
          });
        }
        break;
      }
      case 'skip return checks': {
        if (skipReturnChecks != null) {
          spec.warn({
            type: 'node',
            ruleId: 'header-format',
            message: `duplicate "skip return checks" attribute`,
            node: dt,
          });
        }
        const contents = (dd.textContent ?? '').trim();
        if (contents === 'true') {
          skipReturnChecks = true;
        } else if (contents === 'false') {
          skipReturnChecks = false;
        } else {
          spec.warn({
            type: 'contents',
            ruleId: 'header-format',
            message: `unknown value for "skip return checks" attribute (expected "true" or "false", got ${JSON.stringify(
              contents,
            )})`,
            node: dd,
            nodeRelativeLine: 1,
            nodeRelativeColumn: 1,
          });
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
  return {
    description,
    for: _for,
    effects,
    redefinition: redefinition ?? false,
    skipGlobalChecks: skipGlobalChecks ?? false,
    skipReturnChecks: skipReturnChecks ?? false,
  };
}

export function formatPreamble(
  spec: Spec,
  clause: Element,
  dl: Element,
  type: string | null,
  name: string,
  formattedParams: string,
  formattedReturnType: string | null,
  _for: Element | null,
  description: Element | null,
): Array<Element> {
  const para = spec.doc.createElement('p');
  const paras = [para];
  type = (type ?? '').toLowerCase();
  switch (type) {
    case 'numeric method':
    case 'abstract operation': {
      // TODO tests (for each type of parametered thing) which have HTML in the parameter type
      para.innerHTML += `The abstract operation ${name}`;
      break;
    }
    case 'host-defined abstract operation': {
      para.innerHTML += `The host-defined abstract operation ${name}`;
      break;
    }
    case 'implementation-defined abstract operation': {
      para.innerHTML += `The implementation-defined abstract operation ${name}`;
      break;
    }
    case 'sdo':
    case 'syntax-directed operation': {
      para.innerHTML += `The syntax-directed operation ${name}`;
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
  para.innerHTML += ` takes ${formattedParams}`;
  if (formattedReturnType != null) {
    para.innerHTML += ` and returns ${formattedReturnType}`;
  }
  para.innerHTML += '.';
  if (description != null) {
    const isJustElements = [...description.childNodes].every(
      n => n.nodeType === 1 || (n.nodeType === 3 && n.textContent?.trim() === ''),
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
  const getRelevantElement = (el: Element): Element =>
    el.tagName === 'INS' || el.tagName === 'DEL' ? el.firstElementChild ?? el : el;
  let next = dl.nextElementSibling;
  while (next != null && getRelevantElement(next)?.tagName === 'EMU-NOTE') {
    next = next.nextElementSibling;
  }
  const relevant = next != null ? getRelevantElement(next) : null;
  if (
    (isSdo && next != null && relevant?.tagName === 'EMU-GRAMMAR') ||
    (!isSdo &&
      next != null &&
      relevant?.tagName === 'EMU-ALG' &&
      !relevant?.hasAttribute('replaces-step'))
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

export function formatEnglishList(list: Array<string>, conjuction = 'and') {
  if (list.length === 0) {
    throw new Error('formatEnglishList should not be called with an empty list');
  }
  if (list.length === 1) {
    return list[0];
  }
  if (list.length === 2) {
    return `${list[0]} ${conjuction} ${list[1]}`;
  }
  return `${list.slice(0, -1).join(', ')}, ${conjuction} ${list[list.length - 1]}`;
}

function eat(text: string, regex: RegExp) {
  const match = text.match(regex);
  if (match == null) {
    return { match, text };
  }
  return { match, text: text.substring(match[0].length) };
}
