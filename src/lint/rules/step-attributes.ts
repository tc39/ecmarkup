import type { OrderedListItemNode } from 'ecmarkdown';
import type { Reporter } from '../algorithm-error-reporter-type';
import type { Seq } from '../../expr-parser';

const ruleId = 'unknown-step-attribute';

const KNOWN_ATTRIBUTES = ['id', 'fence-effects', 'declared'];

/*
Checks for unknown attributes on steps.
*/
export default function (report: Reporter, stepSeq: Seq | null, node: OrderedListItemNode) {
  for (const attr of node.attrs) {
    if (!KNOWN_ATTRIBUTES.includes(attr.key)) {
      report({
        ruleId,
        message: `unknown step attribute ${JSON.stringify(attr.key)}`,
        line: attr.location.start.line,
        column: attr.location.start.column,
      });
    }
  }
}
