import type { Node as EcmarkdownNode, Observer } from 'ecmarkdown';
import type { Reporter } from '../algorithm-error-reporter-type';

const ruleId = 'algorithm-step-numbering';

/*
Checks that step numbers are all `1`.
*/
export default function (
  report: Reporter,
  node: Element,
  algorithmSource: string
): Observer {
  return {
    enter(node: EcmarkdownNode) {
      if (node.name === 'ordered-list-item') {
        let itemSource = algorithmSource.slice(
          node.location!.start.offset,
          node.location!.end.offset
        );
        let match = itemSource.match(/^(\s*)(\d+\.) /)!;
        if (match[2] !== '1.') {
          report({
            ruleId,
            line: node.location!.start.line,
            column: node.location!.start.column + match[1].length,
            message: `expected step number to be "1." (found ${JSON.stringify(match[2])})`,
          });
        }
      }
    },
  };
}
