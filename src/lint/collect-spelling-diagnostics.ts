import type { LintingError } from './algorithm-error-reporter-type';

import { offsetToLineAndColumn } from './utils';

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
    pattern: /\*0\*/gu,
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
];

export function collectSpellingDiagnostics(sourceText: string) {
  let composed = new RegExp(matchers.map(m => `(?:${m.pattern.source})`).join('|'), 'u');

  // The usual case will be to have no errors, so we have a fast path for that case.
  // We only fall back to slower individual tests if there is at least one error.
  if (composed.test(sourceText)) {
    let errors: LintingError[] = [];
    for (let { pattern, message } of matchers) {
      let match = pattern.exec(sourceText);
      while (match !== null) {
        let { line, column } = offsetToLineAndColumn(sourceText, match.index);
        errors.push({
          ruleId,
          nodeType: 'text',
          line,
          column,
          message,
        });
        match = pattern.exec(sourceText);
      }
    }
    if (errors.length === 0) {
      throw new Error(
        'Ecmarkup has a bug: the spell checker reported an error, but could not find one. Please report this at https://github.com/tc39/ecmarkup/issues/new.'
      );
    }
    return errors;
  }
  return [];
}
