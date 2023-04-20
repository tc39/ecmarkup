import type { Reporter } from '../algorithm-error-reporter-type';
import type { Seq } from '../../expr-parser';
import type { OrderedListItemNode } from 'ecmarkdown';

const ruleId = 'for-each-element';

/*
Checks that "For each" loops name a type or say "element" before the variable.
*/
export default function (
  report: Reporter,
  step: OrderedListItemNode,
  algorithmSource: string,
  parsedSteps: Map<OrderedListItemNode, Seq>
) {
  const stepSeq = parsedSteps.get(step);
  if (stepSeq == null || stepSeq.items.length < 2) {
    return;
  }
  const [first, second] = stepSeq.items;
  if (first.name === 'text' && first.contents === 'For each ' && second.name === 'underscore') {
    report({
      ruleId,
      line: second.location.start.line,
      column: second.location.start.column,
      message: 'expected "for each" to have a type name or "element" before the loop variable',
    });
  }
}
