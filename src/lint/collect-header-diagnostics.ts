import type { LintingError } from './algorithm-error-reporter-type';

import { getLocation } from './utils';

const ruleId = 'header-format';

export function collectHeaderDiagnostics(
  dom: any,
  headers: { element: Element; contents: string }[]
) {
  let lintingErrors: LintingError[] = [];

  for (let { element, contents } of headers) {
    if (!/\(.*\)$/.test(contents) || / Operator \( `[^`]+` \)$/.test(contents)) {
      continue;
    }

    function indexToLineAndColumn(index: number) {
      let headerLines = contents.split('\n');
      let headerLine = 0;
      let seen = 0;
      while (true) {
        if (seen + headerLines[headerLine].length >= index) {
          break;
        }
        seen += headerLines[headerLine].length + 1; // +1 for the '\n'
        ++headerLine;
      }
      let headerColumn = index - seen;

      let elementLoc = getLocation(dom, element);
      let line = elementLoc.startTag.line + headerLine;
      let column =
        headerLine === 0
          ? elementLoc.startTag.col +
            (elementLoc.startTag.endOffset - elementLoc.startTag.startOffset) +
            headerColumn
          : headerColumn + 1;

      return { line, column };
    }

    let name = contents.substring(0, contents.indexOf('('));
    let params = contents.substring(contents.indexOf('(') + 1, contents.length - 1);

    if (/ $/.test(name)) {
      name = name.substring(0, name.length - 1);
    } else {
      let { line, column } = indexToLineAndColumn(name.length);
      lintingErrors.push({
        ruleId,
        nodeType: 'H1',
        line,
        column,
        message: 'expected header to have a space before the argument list',
      });
    }

    let nameMatches = [
      /^(Runtime|Static) Semantics: [A-Z][A-Za-z0-9/]*$/,
      /^(Number|BigInt)::[a-z][A-Za-z0-9]*$/,
      /^\[\[[A-Z][A-Za-z0-9]*\]\]$/,
      /^_[A-Z][A-Za-z0-9]*_$/,
      /^[A-Za-z][A-Za-z0-9]*(\.[A-Za-z][A-Za-z0-9]*)*( \[ @@[a-z][a-zA-Z]+ \])?$/,
      /^%[A-Z][A-Za-z0-9]*%(\.[A-Za-z][A-Za-z0-9]*)*( \[ @@[a-z][a-zA-Z]+ \])?$/,
    ].some(r => r.test(name));

    if (!nameMatches) {
      let { line, column } = indexToLineAndColumn(0);
      lintingErrors.push({
        ruleId,
        nodeType: 'H1',
        line,
        column,
        message: `expected operation to have a name like 'Example', 'Runtime Semantics: Foo', 'Example.prop', etc, but found ${JSON.stringify(
          name
        )}`,
      });
    }

    let paramsMatches =
      params.match(/\[/g)?.length === params.match(/\]/g)?.length &&
      [
        /^ $/,
        /^ \. \. \. $/,
        /^ (_[A-Za-z0-9]+_, )*\.\.\._[A-Za-z0-9]+_ $/,
        /^ (_[A-Za-z0-9]+_, )*… (, _[A-Za-z0-9]+_)+ $/,
        /^ (\[ )?_[A-Za-z0-9]+_(, _[A-Za-z0-9]+_)*( \[ , _[A-Za-z0-9]+_(, _[A-Za-z0-9]+_)*)*( \])* $/,
      ].some(r => r.test(params));

    if (!paramsMatches) {
      let { line, column } = indexToLineAndColumn(name.length + 1);
      lintingErrors.push({
        ruleId,
        nodeType: 'H1',
        line,
        column,
        message: `expected parameter list to look like '( _a_, [ , _b_ ] )', '( _foo_, _bar_, ..._baz_ )', '( _foo_, … , _bar_ )', or '( . . . )'`,
      });
    }
  }

  return lintingErrors;
}
