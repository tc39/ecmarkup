import type { Node as EcmarkdownNode, OrderedListItemNode, OrderedListNode } from 'ecmarkdown';

import type { LintingError, Reporter } from './algorithm-error-reporter-type';
import type { default as Spec, Warning } from '../Spec';

import { parseAlgorithm } from 'ecmarkdown';

import { warnEmdFailure } from '../utils';
import lintAlgorithmLineStyle from './rules/algorithm-line-style';
import lintAlgorithmStepNumbering from './rules/algorithm-step-numbering';
import lintAlgorithmStepLabels from './rules/algorithm-step-labels';
import lintEnumCasing from './rules/enum-casing';
import lintForEachElement from './rules/for-each-element';
import lintStepAttributes from './rules/step-attributes';
import lintIfElseConsistency from './rules/if-else-consistency';
import { checkVariableUsage } from './rules/variable-use-def';
import type { Seq } from '../expr-parser';
import { parse } from '../expr-parser';

type LineRule = (
  report: Reporter,
  step: OrderedListItemNode,
  algorithmSource: string,
  parsedSteps: Map<OrderedListItemNode, Seq>,
  parent: OrderedListNode,
) => void;
const stepRules: LineRule[] = [
  lintAlgorithmLineStyle,
  lintAlgorithmStepNumbering,
  lintAlgorithmStepLabels,
  lintEnumCasing,
  lintForEachElement,
  lintStepAttributes,
  lintIfElseConsistency,
];

export function collectAlgorithmDiagnostics(
  report: (e: Warning) => void,
  spec: Spec,
  mainSource: string,
  algorithms: { element: Element; tree?: EcmarkdownNode; source?: string }[],
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
      location.endTag.startOffset,
    );
    algorithm.source = algorithmSource;

    let tree;
    try {
      tree = parseAlgorithm(algorithmSource);
    } catch (e) {
      warnEmdFailure(report, element, e as SyntaxError & { line?: number; column?: number });
    }
    const parsedSteps: Map<OrderedListItemNode, Seq> = new Map();
    let allNodesParsedSuccessfully = true;
    function parseStep(step: OrderedListItemNode) {
      const parsed = parse(step.contents, new Set());
      if (parsed.name === 'failure') {
        allNodesParsedSuccessfully = false;
      } else {
        parsedSteps.set(step, parsed);
      }
      if (step.sublist?.name === 'ol') {
        for (const substep of step.sublist.contents) {
          parseStep(substep);
        }
      }
    }

    function applyRule(visit: LineRule, step: OrderedListItemNode, parent: OrderedListNode) {
      // we don't know the names of ops at this point
      // TODO maybe run later in the process? but not worth worrying about for now
      visit(reporter, step, algorithmSource, parsedSteps, parent);
      if (step.sublist?.name === 'ol') {
        for (const substep of step.sublist.contents) {
          applyRule(visit, substep, step.sublist);
        }
      }
    }
    if (tree != null && !element.hasAttribute('example')) {
      for (const step of tree.contents.contents) {
        parseStep(step);
      }

      for (const rule of stepRules) {
        for (const step of tree.contents.contents) {
          applyRule(rule, step, tree.contents);
        }
      }
      if (allNodesParsedSuccessfully) {
        checkVariableUsage(
          algorithmSource,
          algorithm.element,
          tree.contents,
          parsedSteps,
          reporter,
        );
      }
    }

    algorithm.tree = tree;
  }
}
