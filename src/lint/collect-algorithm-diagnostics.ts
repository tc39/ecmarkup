import type { Node as EcmarkdownNode, OrderedListItemNode } from 'ecmarkdown';

import type { LintingError, Reporter } from './algorithm-error-reporter-type';
import type { default as Spec, Warning } from '../Spec';

import { parseAlgorithm } from 'ecmarkdown';

import { warnEmdFailure } from '../utils';
import lintAlgorithmLineStyle from './rules/algorithm-line-style';
import lintAlgorithmStepNumbering from './rules/algorithm-step-numbering';
import lintAlgorithmStepLabels from './rules/algorithm-step-labels';
import lintForEachElement from './rules/for-each-element';
import lintStepAttributes from './rules/step-attributes';
import { checkVariableUsage } from './rules/variable-use-def';

type LineRule = (report: Reporter, step: OrderedListItemNode, algorithmSource: string) => void;
const stepRules: LineRule[] = [
  lintAlgorithmLineStyle,
  lintAlgorithmStepNumbering,
  lintAlgorithmStepLabels,
  lintForEachElement,
  lintStepAttributes,
];

export function collectAlgorithmDiagnostics(
  report: (e: Warning) => void,
  spec: Spec,
  mainSource: string,
  algorithms: { element: Element; tree?: EcmarkdownNode }[]
) {
  for (const algorithm of algorithms) {
    const element = algorithm.element;

    const location = spec.locate(element);
    if (!location) continue;

    const { source: importSource } = location;
    if (location.endTag == null) {
      // we'll warn for this in collect-tag-diagnostics; no need to do so here
      continue;
    }

    // TODO this wrapper is maybe not necessary
    const reporter = ({ ruleId, message, line, column }: LintingError) => {
      report({
        type: 'contents',
        ruleId,
        message,
        node: element,
        nodeRelativeLine: line,
        nodeRelativeColumn: column,
      });
    };

    const algorithmSource = (importSource ?? mainSource).slice(
      location.startTag.endOffset,
      location.endTag.startOffset
    );
    let tree;
    try {
      tree = parseAlgorithm(algorithmSource);
    } catch (e: any) {
      warnEmdFailure(report, element, e);
    }
    function walk(visit: LineRule, step: OrderedListItemNode) {
      visit(reporter, step, algorithmSource); // TODO reconsider algorithmSource
      if (step.sublist?.name === 'ol') {
        for (const substep of step.sublist.contents) {
          walk(visit, substep);
        }
      }
    }
    if (tree != null && !element.hasAttribute('example')) {
      for (const rule of stepRules) {
        for (const step of tree.contents.contents) {
          walk(rule, step);
        }
      }
      checkVariableUsage(algorithm.element, tree.contents, reporter);
    }

    algorithm.tree = tree;
  }
}
