import type { Warning } from '../Spec';
import type { default as Import } from '../Import';

import { offsetToLineAndColumn } from '../utils';

let ruleId = 'spelling';

// Note that these will be composed, so cannot contain backreferences
let matchers = [
  {
    pattern: /\*this\* object/giu,
    message: 'Prefer "*this* value"',
  },
  {
    pattern: /1's complement/giu,
    message: 'Prefer "one\'s complement"',
  },
  {
    pattern: /2's complement/giu,
    message: 'Prefer "two\'s complement"',
  },
  {
    pattern: /\*0\*(?!<sub>ℤ<\/sub>)/gu,
    message: 'The Number value 0 should be written "*+0*", to unambiguously exclude "*-0*"',
  },
  {
    pattern: /behavior/giu,
    message: 'ECMA-262 uses Oxford spelling ("behaviour")',
  },
  {
    pattern: /[Tt]he empty string/gu,
    message: 'Prefer "the empty String"',
  },
  {
    pattern: /[ \t]+\n/gu,
    message: 'Trailing spaces are not allowed',
  },
  {
    pattern: /(?<=(^|[^\n])\n\n)\n+/gu,
    message: 'No more than one blank line is allowed',
  },
  {
    pattern: /(?<=<emu-clause.*>\n)\n\s*<h1>/giu,
    message: "There should not be a blank line between a clause's opening tag and its header",
  },
  {
    pattern: /(?<=(^|[^\n])\n)\n+[ \t]*<\/emu-clause>/giu,
    message:
      'There should not be a blank line between the last line of a clause and its closing tag',
  },
  {
    pattern: /\r/gu,
    message: 'Only Unix-style (LF) linebreaks are allowed',
  },
  {
    pattern: /(?<=\b[Ss]teps? )\d/gu,
    message: 'Prefer using labeled steps and <emu-xref> tags over hardcoding step numbers',
  },
];

export function collectSpellingDiagnostics(
  report: (e: Warning) => void,
  mainSource: string,
  imports: Import[]
) {
  let composed = new RegExp(matchers.map(m => `(?:${m.pattern.source})`).join('|'), 'u');

  let toTest: { source: string; importLocation?: string }[] = [{ source: mainSource }].concat(
    imports
  );
  for (let { source, importLocation } of toTest) {
    // The usual case will be to have no errors, so we have a fast path for that case.
    // We only fall back to slower individual tests if there is at least one error.
    if (composed.test(source)) {
      let reported = false;
      for (let { pattern, message } of matchers) {
        let match = pattern.exec(source);
        while (match !== null) {
          reported = true;
          let { line, column } = offsetToLineAndColumn(source, match.index);
          report({
            type: 'raw',
            ruleId,
            line,
            column,
            message,
            source,
            file: importLocation,
          });
          match = pattern.exec(source);
        }
      }
      if (!reported) {
        throw new Error(
          'Ecmarkup has a bug: the spell checker reported an error, but could not find one. Please report this at https://github.com/tc39/ecmarkup/issues/new.'
        );
      }
    }
  }
}
