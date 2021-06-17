import type { Node as EcmarkdownNode, Observer } from 'ecmarkdown';
import type { Reporter } from '../algorithm-error-reporter-type';

const ruleId = 'for-each-element';

/*
Checks that "For each" loops name a type or say "element" before the variable.
*/
export default function (report: Reporter): Observer {
  return {
    enter(node: EcmarkdownNode) {
      if (node.name !== 'ordered-list-item' || node.contents.length < 2) {
        return;
      }
      const [first, second] = node.contents;
      if (first.name === 'text' && first.contents === 'For each ' && second.name === 'underscore') {
        report({
          ruleId,
          line: second.location.start.line,
          column: second.location.start.column,
          message: 'expected "for each" to have a type name or "element" before the loop variable',
        });
      }
    },
  };
}
