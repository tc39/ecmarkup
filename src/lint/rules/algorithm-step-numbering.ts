import type { Node as EcmarkdownNode, Observer } from 'ecmarkdown';
import type { LintingError } from '../algorithm-error-reporter-type';

const ruleId = 'algorithm-step-numbering';

/*
Checks that step numbers are all `1`, with the exception of top-level lists whose first item is not `1`.
*/
export default function (
  report: (e: LintingError) => void,
  node: Element,
  algorithmSource: string
): Observer {
  const nodeType = node.tagName;
  let depth = -1;
  let topLevelIsOne = false;
  return {
    enter(node: EcmarkdownNode) {
      if (node.name === 'ol') {
        ++depth;
        if (depth === 0) {
          topLevelIsOne = node.start === 1;
        }
      } else if (node.name === 'ordered-list-item') {
        if (depth === 0 && !topLevelIsOne) {
          return;
        }
        let itemSource = algorithmSource.slice(
          node.location!.start.offset,
          node.location!.end.offset
        );
        let match = itemSource.match(/^(\s*)(\d+\.) /)!;
        if (match[2] !== '1.') {
          report({
            ruleId,
            nodeType,
            line: node.location!.start.line,
            column: node.location!.start.column + match[1].length,
            message: `expected step number to be "1." (found ${JSON.stringify(match[2])})`,
          });
        }
      }
    },
    exit(node: EcmarkdownNode) {
      if (node.name === 'ol') {
        --depth;
      }
    },
  };
}
