import type { Warning } from '../Spec';
import type { default as Import } from '../Import';

import { offsetToLineAndColumn } from '../utils';

const ruleId = 'spelling';

// Note that these will be composed, so cannot contain backreferences
const matchers = [
  {
    pattern: /\*this\* object/gu,
    message: 'prefer "*this* value"',
  },
  {
    pattern: /1's complement/gu,
    message: 'prefer "one\'s complement"',
  },
  {
    pattern: /2's complement/gu,
    message: 'prefer "two\'s complement"',
  },
  {
    pattern: /\*0\*(?!<sub>ℤ<\/sub>)/gu,
    message: 'the Number value 0 should be written "*+0*", to unambiguously exclude "*-0*"',
  },
  {
    pattern: /[+-]?(?:&[a-z]+;|0x[0-9A-Fa-f]+|[0-9]+(?:\.[0-9]+)?)<sub>𝔽<\/sub>/gu,
    message: 'literal Number values should be bolded',
  },
  {
    pattern: /[+-]?[0-9]+<sub>ℤ<\/sub>/gu,
    message: 'literal BigInt values should be bolded',
  },
  {
    pattern: /\*[+-]?(?:&[a-z]+;|0x[0-9A-Fa-f]+|[0-9]+(?:\.[0-9]+)?)\*(?!<sub>[𝔽ℤ]<\/sub>)/gu,
    message:
      'literal Number or BigInt values should be followed by <sub>𝔽</sub> or <sub>ℤ</sub> respectively',
  },
  {
    pattern: /(?<=\*)\+(?:0x[1-9A-Fa-f]|[1-9])/gu,
    message: 'positive numeric values other than 0 should not have a leading plus sign (+)',
  },
  {
    // this needs its own rule to catch +0 as a real number
    pattern: /(?<= )\+[0-9]/gu,
    message: 'positive real numbers should not have a leading plus sign (+)',
  },
  {
    pattern: /(?<![+-])&infin;/gu,
    message: '&infin; should always be written with a leading + or -',
  },
  {
    pattern: /(?<= )[+-]\*(?:&[a-z]+;|0x[0-9A-Fa-f]+|[0-9]+(?:\.[0-9]+)?)\*/gu,
    message: 'the sign character for a numeric literal should be within the `*`s',
  },
  {
    pattern: /(?<=\bmathematical value )for\b/gu,
    message: 'the mathematical value "of", not "for"',
  },
  {
    pattern: /(?<=\b[Nn]umber value )of\b/gu,
    message: 'the Number value "for", not "of"',
  },
  {
    pattern: /\bnumber value\b/gu,
    message: '"Number value", not "number value"',
  },
  {
    pattern: /[Bb]ehavior/gu,
    message: 'ECMA-262 uses Oxford spelling ("behaviour")',
  },
  {
    pattern: /[Ii]ndexes/gu,
    message: 'prefer "indices"',
  },
  {
    pattern: /\b[Nn]onnegative\b/gu,
    message: 'prefer "non-negative"',
  },
  {
    pattern: /\b[Nn]onzero\b/gu,
    message: 'prefer "non-zero"',
  },
  {
    pattern: /[Tt]he empty string/gu,
    message: 'prefer "the empty String"',
  },
  {
    pattern: /[ \t]+\n/gu,
    message: 'trailing spaces are not allowed',
  },
  {
    pattern: /(?<=(^|[^\n])\n\n)\n+/gu,
    message: 'no more than one blank line is allowed',
  },
  {
    pattern: /(?<=<emu-clause.*>\n)\n\s*<h1>/gu,
    message: "there should not be a blank line between a clause's opening tag and its header",
  },
  {
    pattern: /(?<=(^|[^\n])\n)\n+[ \t]*<\/emu-clause>/gu,
    message:
      'there should not be a blank line between the last line of a clause and its closing tag',
  },
  {
    pattern: /\r/gu,
    message: 'only Unix-style (LF) linebreaks are allowed',
  },
  {
    pattern: /(?<=\b[Ss]teps? )\d/gu,
    message: 'prefer using labeled steps and <emu-xref> tags over hardcoding step numbers',
  },
  {
    pattern: /(?<=\b[Cc]lauses? )\d/gu,
    message:
      'clauses should be referenced using <emu-xref> tags rather than hardcoding clause numbers',
  },
  {
    pattern: /(?<=\S)  +(?! |<\/(td|th|dd|dt)>)/gu,
    message: 'multiple consecutive spaces are not allowed',
  },
  {
    pattern: /(?<=<[a-z]+( [a-z]+(="[^"\n]+")?)*>)(?<!(td|th|dd|dt|ins|del)>) /gu,
    message: 'tags should not contain leading whitespace',
  },
  {
    pattern: /(?<=[^ \n]) +<\/(?!td|th|dd|dt|ins|del)/gu,
    message: 'tags should not contain trailing whitespace',
  },
  {
    pattern: /(?<=&[lg][et]; ?\*)-0\*/gu,
    message: 'comparisons against floating-point zero should use positive zero',
  },
  {
    pattern: /(÷|&divide;)/gu,
    message: 'division should be written as "/", not "÷", per ISO 80000-2',
  },
];

export function collectSpellingDiagnostics(
  report: (e: Warning) => void,
  mainSource: string,
  imports: Import[]
) {
  const composed = new RegExp(matchers.map(m => `(?:${m.pattern.source})`).join('|'), 'u');

  const toTest: { source: string; importLocation?: string }[] = [{ source: mainSource }].concat(
    imports
  );
  for (const { source, importLocation } of toTest) {
    // The usual case will be to have no errors, so we have a fast path for that case.
    // We only fall back to slower individual tests if there is at least one error.
    if (composed.test(source)) {
      let reported = false;
      for (const { pattern, message } of matchers) {
        let match = pattern.exec(source);
        while (match !== null) {
          reported = true;
          const { line, column } = offsetToLineAndColumn(source, match.index);
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
