import { printSimpleParamList } from '../header-parser';
import type { Param, ParsedHeaderOrFailure } from '../header-parser';
import { LineBuilder } from './line-builder';

function printTypedParam(param: Param, optional: boolean) {
  let p = (optional ? 'optional ' : '') + param.name + ': ' + (param.type ?? 'unknown') + ',';
  if (param.wrappingTag) {
    p = `<${param.wrappingTag}>${p}</${param.wrappingTag}>`;
  }
  return p;
}

function ensureUnderscores(param: Param) {
  if (!/^[a-zA-Z0-9]+$/.test(param.name)) {
    return param;
  }
  return {
    ...param,
    name: '_' + param.name + '_',
  };
}

export function printHeader(
  parseResult: ParsedHeaderOrFailure & { type: 'single-line' | 'multi-line' },
  clauseType: string | null,
  indent: number
): LineBuilder {
  /* eslint-disable prefer-const */
  let {
    type,
    wrappingTag,
    prefix,
    name,
    params,
    optionalParams,
    returnType,
    // errors is already handled
  } = parseResult;
  /* eslint-enable prefer-const */

  const result = new LineBuilder(indent);
  if (type === 'multi-line') {
    result.firstLineIsPartial = false;
  }
  if (wrappingTag !== null) {
    result.appendText(`<${wrappingTag}>`);
  }
  if (prefix !== null) {
    result.appendText(prefix + ' ');
  }
  result.appendText(name);

  params = params.map(ensureUnderscores);
  optionalParams = optionalParams.map(ensureUnderscores);

  if (
    clauseType === 'sdo' &&
    params.length === 0 &&
    optionalParams.length === 0 &&
    returnType === null
  ) {
    // do not print a parameter list
  } else if (type === 'single-line') {
    result.appendText(' ' + printSimpleParamList(params, optionalParams));
  } else {
    result.appendText(' (');
    ++result.indent;
    for (const param of params) {
      result.appendLine(printTypedParam(param, false));
    }
    for (const param of optionalParams) {
      result.appendLine(printTypedParam(param, true));
    }
    --result.indent;
    result.appendText(')');
  }
  if (returnType !== null && returnType !== '') {
    result.appendText(': ' + returnType);
  }
  if (wrappingTag !== null) {
    result.appendText(`</${wrappingTag}>`);
  }
  if (type === 'multi-line') {
    result.linebreak();
  }

  return result;
}
