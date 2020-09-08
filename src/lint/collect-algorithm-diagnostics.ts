import type { Node as EcmarkdownNode, Observer } from 'ecmarkdown';

import type { LintingError } from './algorithm-error-reporter-type';
import type { default as Spec, Warning } from '../Spec';

import { parseAlgorithm, visit } from 'ecmarkdown';

import { warnEmdFailure } from '../utils';
import lintAlgorithmLineEndings from './rules/algorithm-line-endings';
import lintAlgorithmStepNumbering from './rules/algorithm-step-numbering';
import lintAlgorithmStepLabels from './rules/algorithm-step-labels';
import lintForEachElement from './rules/for-each-element';

let algorithmRules = [
  lintAlgorithmLineEndings,
  lintAlgorithmStepNumbering,
  lintAlgorithmStepLabels,
  lintForEachElement,
];

function composeObservers(...observers: Observer[]): Observer {
  return {
    enter(node: EcmarkdownNode) {
      for (let observer of observers) {
        observer.enter?.(node);
      }
    },
    exit(node: EcmarkdownNode) {
      for (let observer of observers) {
        observer.exit?.(node);
      }
    },
  };
}

export function collectAlgorithmDiagnostics(
  report: (e: Warning) => void,
  spec: Spec,
  mainSource: string,
  algorithms: { element: Element; tree?: EcmarkdownNode }[]
) {
  for (let algorithm of algorithms) {
    let element = algorithm.element;

    const location = spec.locate(element);
    if (!location) continue;

    let { source: importSource } = location;
    if (location.endTag == null) {
      report({
        type: 'node',
        ruleId: 'missing-close-tag',
        message: 'could not find closing tag for emu-alg',
        node: algorithm.element,
      });
      continue;
    }

    // TODO this wrapper is maybe not necessary
    let reporter = ({ ruleId, message, line, column }: LintingError) => {
      report({
        type: 'contents',
        ruleId,
        message,
        node: element,
        nodeRelativeLine: line,
        nodeRelativeColumn: column,
      });
    };

    let algorithmSource = (importSource ?? mainSource).slice(
      location.startTag.endOffset,
      location.endTag.startOffset
    );
    let observer = composeObservers(
      ...algorithmRules.map(f => f(reporter, element, algorithmSource))
    );
    let tree;
    try {
      tree = parseAlgorithm(algorithmSource);
    } catch (e) {
      warnEmdFailure(report, element, e);
    }
    if (tree != null) {
      visit(tree, observer);
    }

    algorithm.tree = tree;
  }
}
