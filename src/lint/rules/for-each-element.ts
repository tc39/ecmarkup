import type { Reporter } from '../algorithm-error-reporter-type';
import type { Seq } from '../../expr-parser';

const ruleId = 'for-each-element';

/*
Checks that "For each" loops name a type or say "element" before the variable.
*/
export default function (report: Reporter, stepSeq: Seq | null) {
  if (stepSeq == null || stepSeq.items.length < 2) {
    return;
  }
  const [first, second] = stepSeq.items;
  if (
    first.type === 'fragment' &&
    first.frag.name === 'text' &&
    first.frag.contents === 'For each ' &&
    second.type === 'fragment' &&
    second.frag.name === 'underscore'
  ) {
    report({
      ruleId,
      line: second.frag.location.start.line,
      column: second.frag.location.start.column,
      message: 'expected "for each" to have a type name or "element" before the loop variable',
    });
  }
}
