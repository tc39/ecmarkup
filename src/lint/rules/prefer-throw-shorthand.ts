import type { Reporter } from '../algorithm-error-reporter-type';
import type { OrderedListItemNode } from 'ecmarkdown';
import type { Seq } from '../../expr-parser';
import { walk as walkExpr } from '../../expr-parser';
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
  if (step.contents.length === 0) {
    return;
  }
  const stepSeq = parsedSteps.get(step);
  if (stepSeq == null) {
    return;
  }
  const stepSource = algorithmSource.slice(
    step.contents[0].location.start.offset,
    step.contents[step.contents.length - 1].location.end.offset,
  );
  const baseOffset = step.contents[0].location.start.offset;

  walkExpr(expr => {
    if (
      expr.name === 'call' &&
      expr.callee.length === 1 &&
      expr.callee[0].name === 'text' &&
      expr.callee[0].contents === 'ThrowCompletion'
    ) {
      const textBefore = stepSource.slice(0, expr.callee[0].location.start.offset - baseOffset);
      if (/\breturn\s+$/i.test(textBefore)) {
        report({
          ruleId,
          message: 'prefer "throw _x_" over "return ThrowCompletion(_x_)"',
          ...offsetToLineAndColumn(algorithmSource, expr.callee[0].location.start.offset),
        });
      }
    }
  }, stepSeq);
}
