import type { Reporter } from '../algorithm-error-reporter-type';
import type { Seq } from '../../expr-parser';

const ruleId = 'for-each-element';

/*
Checks that "For each" loops name a type or say "element" before the variable.
*/
export default function (report: Reporter, stepSeq: Seq | null) {
  if (stepSeq?.items[0]?.type !== 'fragment' || stepSeq.items[0].parts.length < 2) {
    return;
  }
  const [first, second] = stepSeq.items[0].parts;
  if (first.name === 'text' && first.contents === 'For each ' && second.name === 'underscore') {
    report({
      ruleId,
      line: second.location.start.line,
      column: second.location.start.column,
      message: 'expected "for each" to have a type name or "element" before the loop variable',
    });
  }
}
