import type { Node as EcmarkdownNode, Observer } from 'ecmarkdown';
import type { Reporter } from '../algorithm-error-reporter-type';

const ruleId = 'algorithm-step-labels';

/*
Checks that step labels all start with `step-`.
*/
export default function (report: Reporter, node: Element, algorithmSource: string): Observer {
  return {
    enter(node: EcmarkdownNode) {
      // console.log(node)
      if (node.name === 'ordered-list-item' && node.id != null && !/^step-/.test(node.id)) {
        let itemSource = algorithmSource.slice(
          node.location!.start.offset,
          node.location!.end.offset
        );
        let offset = itemSource.match(/^\s*\d+\. \[id="/)![0].length;
        report({
          ruleId,
          line: node.location!.start.line,
          column: node.location!.start.column + offset,
          message: `step labels should start with "step-"`,
        });
      }
    },
  };
}
