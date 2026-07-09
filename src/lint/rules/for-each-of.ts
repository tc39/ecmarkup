import type { Reporter } from '../algorithm-error-reporter-type';
import type { Seq } from '../../expr-parser';
import type { OrderedListItemNode } from 'ecmarkdown';
import { offsetToLineAndColumn } from '../../utils';

const ruleId = 'for-each-of';

/*
Checks that "For each" loops use "of", not "in".
Exception: iterating over an interval, e.g. "in the inclusive interval from _a_ to _b_", correctly uses "in".
*/
export default function (
  report: Reporter,
  step: OrderedListItemNode,
  algorithmSource: string,
  parsedSteps: Map<OrderedListItemNode, Seq>,
) {
  const stepSeq = parsedSteps.get(step);
  if (stepSeq == null || stepSeq.items.length < 3) {
    return;
  }
  const first = stepSeq.items[0];
  if (!(first.name === 'text' && first.contents.startsWith('For each '))) {
    return;
  }
  // Find the loop variable (underscore), then check the text after it
  for (let i = 1; i < stepSeq.items.length - 1; i++) {
    const item = stepSeq.items[i];
    if (item.name !== 'underscore') {
      continue;
    }

    const next = stepSeq.items[i + 1];
    if (
      next.name === 'text' &&
      /^ in\b/.test(next.contents) &&
      // Iterating over an interval is a valid construction where "in" is correct, in either the
      // "inclusive interval from _a_ to _b_" shorthand or the full "interval from _a_ ... to _b_ ..." form.
      !/^ in the (?:inclusive )?interval from\b/.test(next.contents)
    ) {
      report({
        ruleId,
        ...offsetToLineAndColumn(algorithmSource, next.location.start.offset + 1),
        message: 'expected "of" instead of "in" in "for each"',
      });
    }
    break;
  }
}
