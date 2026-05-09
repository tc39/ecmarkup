import type { Reporter } from '../algorithm-error-reporter-type';
import type { OrderedListItemNode } from 'ecmarkdown';
import type { Seq } from '../../expr-parser';
import { offsetToLineAndColumn } from '../../utils';

const ruleId = 'prefer-throw-shorthand';

/*
Checks that "return ThrowCompletion(...)" is written using the "throw" shorthand.
Does not flag ThrowCompletion when its result is assigned to an alias.
*/
export default function (
  report: Reporter,
  step: OrderedListItemNode,
  algorithmSource: string,
  parsedSteps: Map<OrderedListItemNode, Seq>,
) {
  const stepSeq = parsedSteps.get(step);
  if (stepSeq == null) {
    return;
  }
  const items = stepSeq.items;
  for (let i = 1; i < items.length; ++i) {
    const item = items[i];
    if (
      item.name === 'call' &&
      item.callee.length === 1 &&
      item.callee[0].name === 'text' &&
      item.callee[0].contents === 'ThrowCompletion'
    ) {
      const prev = items[i - 1];
      if (prev.name === 'text' && /\breturn\s+$/i.test(prev.contents)) {
        report({
          ruleId,
          message: 'prefer "throw _x_" over "return ThrowCompletion(_x_)"',
          ...offsetToLineAndColumn(algorithmSource, item.callee[0].location.start.offset),
        });
      }
    }
  }
}
