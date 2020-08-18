import type { Warning } from '../Spec';

import { offsetToLineAndColumn } from '../utils';

const ruleId = 'header-format';

export function collectHeaderDiagnostics(
  report: (e: Warning) => void,
  headers: { element: Element; contents: string }[]
) {
  for (let { element, contents } of headers) {
    if (!/\(.*\)$/.test(contents) || / Operator \( `[^`]+` \)$/.test(contents)) {
      continue;
    }

    let name = contents.substring(0, contents.indexOf('('));
    let params = contents.substring(contents.indexOf('(') + 1, contents.length - 1);

    if (!/[\S] $/.test(name)) {
      let { line, column } = offsetToLineAndColumn(contents, name.length - 1);

      report({
        type: 'contents',
        ruleId,
        message: 'expected header to have a single space before the argument list',
        node: element,
        nodeRelativeLine: line,
        nodeRelativeColumn: column,
      });
    }

    let nameMatches = [
      // Runtime Semantics: Foo
      /^(Runtime|Static) Semantics: [A-Z][A-Za-z0-9/]*\s*$/,

      // Number::foo
      /^[A-Z][A-Za-z0-9]*::[a-z][A-Za-z0-9]*\s*$/,

      // [[GetOwnProperty]]
      /^\[\[[A-Z][A-Za-z0-9]*\]\]\s*$/,

      // _NativeError_
      /^_[A-Z][A-Za-z0-9]*_\s*$/,

      // CreateForInIterator
      // Object.fromEntries
      // ForIn/OfHeadEvaluation
      // Array.prototype [ @@iterator ]
      // Object.prototype.__defineGetter__
      /^[A-Za-z][A-Za-z0-9/]*(\.[A-Za-z][A-Za-z0-9]*)*(\.__[a-z][A-Za-z0-9]*__| \[ @@[a-z][a-zA-Z]+ \])?\s*$/,

      // %ForInIteratorPrototype%.next
      // %TypedArray%.prototype [ @@iterator ]
      /^%[A-Z][A-Za-z0-9]*%(\.[A-Za-z][A-Za-z0-9]*)*( \[ @@[a-z][a-zA-Z]+ \])?\s*$/,
    ].some(r => r.test(name));

    if (!nameMatches) {
      let { line, column } = offsetToLineAndColumn(contents, 0);
      report({
        type: 'contents',
        ruleId,
        message: `expected operation to have a name like 'Example', 'Runtime Semantics: Foo', 'Example.prop', etc, but found ${JSON.stringify(
          name
        )}`,
        node: element,
        nodeRelativeLine: line,
        nodeRelativeColumn: column,
      });
    }

    let paramsMatches =
      params.match(/\[/g)?.length === params.match(/\]/g)?.length &&
      [
        // Foo ( )
        /^ $/,

        // Object ( . . . )
        /^ \. \. \. $/,

        // String.raw ( _template_, ..._substitutions_ )
        /^ (_[A-Za-z0-9]+_, )*\.\.\._[A-Za-z0-9]+_ $/,

        // Function ( _p1_, _p2_, &hellip; , _pn_, _body_ )
        /^ (_[A-Za-z0-9]+_, )*… (, _[A-Za-z0-9]+_)+ $/,

        // Example ( _foo_ [ , _bar_ ] )
        // Example ( [ _foo_ ] )
        /^ (\[ )?_[A-Za-z0-9]+_(, _[A-Za-z0-9]+_)*( \[ , _[A-Za-z0-9]+_(, _[A-Za-z0-9]+_)*)*( \])* $/,
      ].some(r => r.test(params));

    if (!paramsMatches) {
      let { line, column } = offsetToLineAndColumn(contents, name.length);
      report({
        type: 'contents',
        ruleId,
        message: `expected parameter list to look like '( _a_ [ , _b_ ] )', '( _foo_, _bar_, ..._baz_ )', '( _foo_, … , _bar_ )', or '( . . . )'`,
        node: element,
        nodeRelativeLine: line,
        nodeRelativeColumn: column,
      });
    }
  }
}
