import type { Node as EcmarkdownNode, Observer } from 'ecmarkdown';
import type { Reporter } from '../algorithm-error-reporter-type';

const ruleId = 'unknown-step-attribute';

const KNOWN_ATTRIBUTES = ['id', 'fence-effects', 'declared'];

/*
Checks for unknown attributes on steps.
*/
export default function (report: Reporter): Observer {
  return {
    enter(node: EcmarkdownNode) {
      if (node.name !== 'ordered-list-item') {
        return;
      }
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
    },
  };
}
