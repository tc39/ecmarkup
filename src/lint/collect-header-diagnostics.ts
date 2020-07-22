import type { EcmarkupError } from '../ecmarkup';

import { getLocation, offsetWithinElementToTrueLocation } from '../utils';

const ruleId = 'header-format';

export function collectHeaderDiagnostics(
  dom: any,
  headers: { element: Element; contents: string }[]
) {
  let lintingErrors: EcmarkupError[] = [];

  for (let { element, contents } of headers) {
    if (!/\(.*\)$/.test(contents) || / Operator \( `[^`]+` \)$/.test(contents)) {
      continue;
    }

    let name = contents.substring(0, contents.indexOf('('));
    let params = contents.substring(contents.indexOf('(') + 1, contents.length - 1);

    if (!/[\S] $/.test(name)) {
      let { line, column } = offsetWithinElementToTrueLocation(
        getLocation(dom, element),
        contents,
        name.length - 1
      );
      lintingErrors.push({
        ruleId,
        nodeType: element.tagName,
        line,
        column,
        message: 'expected header to have a single space before the argument list',
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
      // Array.prototype [ @@iterator ]
      /^[A-Za-z][A-Za-z0-9]*(\.[A-Za-z][A-Za-z0-9]*)*( \[ @@[a-z][a-zA-Z]+ \])?\s*$/,

      // %ForInIteratorPrototype%.next
      // %TypedArray%.prototype [ @@iterator ]
      /^%[A-Z][A-Za-z0-9]*%(\.[A-Za-z][A-Za-z0-9]*)*( \[ @@[a-z][a-zA-Z]+ \])?\s*$/,
    ].some(r => r.test(name));

    if (!nameMatches) {
      let { line, column } = offsetWithinElementToTrueLocation(
        getLocation(dom, element),
        contents,
        0
      );
      lintingErrors.push({
        ruleId,
        nodeType: element.tagName,
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
      let { line, column } = offsetWithinElementToTrueLocation(
        getLocation(dom, element),
        contents,
        name.length
      );
      lintingErrors.push({
        ruleId,
        nodeType: element.tagName,
        line,
        column,
        message: `expected parameter list to look like '( _a_ [ , _b_ ] )', '( _foo_, _bar_, ..._baz_ )', '( _foo_, … , _bar_ )', or '( . . . )'`,
      });
    }
  }

  return lintingErrors;
}
