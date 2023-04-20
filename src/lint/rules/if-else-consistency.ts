import type { Reporter } from '../algorithm-error-reporter-type';
import type { Seq } from '../../expr-parser';
import type { OrderedListItemNode, OrderedListNode } from 'ecmarkdown';
import { offsetToLineAndColumn } from '../../utils';

const ruleId = 'if-else-consistency';

/*
Checks that `if`/`else` statements are both single-line or both multi-line.
*/
export default function (
  report: Reporter,
  step: OrderedListItemNode,
  algorithmSource: string,
  parsedSteps: Map<OrderedListItemNode, Seq>,
  parent: OrderedListNode
) {
  const stepSeq = parsedSteps.get(step);
  if (stepSeq == null) {
    return;
  }
  const firstSeqItem = stepSeq.items[0];
  if (firstSeqItem?.name !== 'text' || !/^(?:If|Else if)\b/.test(firstSeqItem.contents)) {
    return;
  }
  const idx = parent.contents.indexOf(step);
  if (idx >= parent.contents.length - 1) {
    return;
  }
  const nextStep = parent.contents[idx + 1];
  const nextSeq = parsedSteps.get(nextStep);
  if (nextSeq == null) {
    return;
  }
  const nextFirstSeqitem = nextSeq.items[0];
  if (
    nextFirstSeqitem?.name !== 'text' ||
    !/^(?:Else|Otherwise)\b/.test(nextFirstSeqitem.contents)
  ) {
    return;
  }
  if (step.sublist != null && nextStep.sublist == null) {
    const location = offsetToLineAndColumn(algorithmSource, nextFirstSeqitem.location.start.offset);
    report({
      ruleId,
      ...location,
      message: '"Else" steps should be multiline whenever their corresponding "If" is',
    });
  } else if (step.sublist == null && nextStep.sublist != null) {
    const location = offsetToLineAndColumn(algorithmSource, firstSeqItem.location.start.offset);
    report({
      ruleId,
      ...location,
      message: '"If" steps should be multiline whenever their corresponding "Else" is',
    });
  }
}
