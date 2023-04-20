import type { OrderedListItemNode } from 'ecmarkdown';
import type { Reporter } from '../algorithm-error-reporter-type';

import { SPECIAL_KINDS } from '../../Clause';

const ruleId = 'step-attribute';

const KNOWN_ATTRIBUTES = ['id', 'fence-effects', 'declared', ...SPECIAL_KINDS];

/*
Checks for unknown attributes on steps.
*/
export default function (report: Reporter, node: OrderedListItemNode) {
  for (const attr of node.attrs) {
    if (!KNOWN_ATTRIBUTES.includes(attr.key)) {
      report({
        ruleId,
        message: `unknown step attribute ${JSON.stringify(attr.key)}`,
        line: attr.location.start.line,
        column: attr.location.start.column,
      });
    } else if (attr.value !== '' && SPECIAL_KINDS.includes(attr.key)) {
      report({
        ruleId,
        message: `step attribute ${JSON.stringify(attr.key)} should not have a value`,
        line: attr.location.start.line,
        column: attr.location.start.column + attr.key.length + 2, // ="
      });
    }
  }
}
