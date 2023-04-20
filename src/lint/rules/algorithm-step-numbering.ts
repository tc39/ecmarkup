import type { OrderedListItemNode } from 'ecmarkdown';
import type { Reporter } from '../algorithm-error-reporter-type';

const ruleId = 'algorithm-step-numbering';

/*
Checks that step numbers are all `1`.
*/
export default function (report: Reporter, node: OrderedListItemNode, algorithmSource: string) {
  const itemSource = algorithmSource.slice(node.location.start.offset, node.location.end.offset);
  const match = itemSource.match(/^(\s*)(\d+\.) /)!;
  if (match[2] !== '1.') {
    report({
      ruleId,
      line: node.location.start.line,
      column: node.location.start.column + match[1].length,
      message: `expected step number to be "1." (found ${JSON.stringify(match[2])})`,
    });
  }
}
