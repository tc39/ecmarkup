import type { Node as EcmarkdownNode, Observer } from 'ecmarkdown';
import type { Reporter } from '../algorithm-error-reporter-type';

const ruleId = 'algorithm-step-labels';

/*
Checks that step labels all start with `step-`.
*/
export default function (report: Reporter, node: Element, algorithmSource: string): Observer {
  return {
    enter(node: EcmarkdownNode) {
      if (node.name !== 'ordered-list-item') {
        return;
      }
      const idAttr = node.attrs.find(({ key }) => key === 'id');
      if (idAttr != null && !/^step-/.test(idAttr.value)) {
        const itemSource = algorithmSource.slice(
          idAttr.location.start.offset,
          idAttr.location.end.offset
        );
        const offset = itemSource.match(/^id *= *"/)![0].length;
        report({
          ruleId,
          line: idAttr.location.start.line,
          column: idAttr.location.start.column + offset,
          message: `step labels should start with "step-"`,
        });
      }
    },
  };
}
