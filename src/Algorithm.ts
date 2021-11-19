import type { Context } from './Context';
import type { Node as EcmarkdownNode, OrderedListItemNode } from 'ecmarkdown';
import type { PartialBiblioEntry, StepBiblioEntry } from './Biblio';

import Builder from './Builder';
import { warnEmdFailure, wrapEmdFailure } from './utils';
import { collectNonterminalsFromEmd } from './lint/utils';
import * as emd from 'ecmarkdown';

function findLabeledSteps(root: EcmarkdownNode) {
  const steps: OrderedListItemNode[] = [];
  emd.visit(root, {
    enter(node: EcmarkdownNode) {
      if (node.name === 'ordered-list-item' && node.id != null) {
        steps.push(node);
      }
    },
  });
  return steps;
}

/*@internal*/
export default class Algorithm extends Builder {
  static async enter(context: Context) {
    context.inAlg = true;
    const { spec, node, clauseStack } = context;

    const innerHTML = node.innerHTML; // TODO use original slice, forward this from linter

    let emdTree;
    if ('ecmarkdownTree' in node) {
      emdTree = (node as any).ecmarkdownTree;
    } else {
      try {
        emdTree = emd.parseAlgorithm(innerHTML);
      } catch (e) {
        warnEmdFailure(spec.warn, node, e);
      }
    }
    if (emdTree == null) {
      node.innerHTML = wrapEmdFailure(innerHTML);
      return;
    }

    if (spec.opts.lintSpec && spec.locate(node) != null && !node.hasAttribute('example')) {
      const clause = clauseStack[clauseStack.length - 1];
      const namespace = clause ? clause.namespace : spec.namespace;
      const nonterminals = collectNonterminalsFromEmd(emdTree).map(({ name, loc }) => ({
        name,
        loc,
        node,
        namespace,
      }));
      spec._ntStringRefs = spec._ntStringRefs.concat(nonterminals);
    }

    const rawHtml = emd.emit(emdTree);

    // replace spaces after !/? with &nbsp; to prevent bad line breaking
    const html = rawHtml.replace(/((?:\s+|>)[!?])[ \t]+/g, '$1&nbsp;');
    node.innerHTML = html;

    const labeledStepEntries: StepBiblioEntry[] = [];
    const replaces = node.getAttribute('replaces-step');
    if (replaces) {
      context.spec.replacementAlgorithms.push({
        element: node,
        target: replaces,
      });
      context.spec.replacementAlgorithmToContainedLabeledStepEntries.set(node, labeledStepEntries);
    }

    if (replaces && node.firstElementChild!.children.length > 1) {
      const labeledSteps = findLabeledSteps(emdTree);
      for (const step of labeledSteps) {
        const itemSource = innerHTML.slice(step.location.start.offset, step.location.end.offset);
        const offset = itemSource.match(/^\s*\d+\. \[id="/)![0].length;
        spec.warn({
          type: 'contents',
          ruleId: 'labeled-step-in-replacement',
          message:
            'labeling a step in a replacement algorithm which has multiple top-level steps is unsupported because the resulting step number would be ambiguous',
          node,
          nodeRelativeLine: step.location.start.line,
          nodeRelativeColumn: step.location.start.column + offset,
        });
      }
    }

    for (const step of node.querySelectorAll('li[id]')) {
      const entry: PartialBiblioEntry = {
        type: 'step',
        id: step.id,
        stepNumbers: getStepNumbers(step as Element),
      };
      context.spec.biblio.add(entry);
      if (replaces) {
        // The biblio entries for labeled steps in replacement algorithms will be modified in-place by a subsequent pass
        labeledStepEntries.push(entry as StepBiblioEntry);
        context.spec.labeledStepsToBeRectified.add(step.id);
      }
    }
  }

  static exit(context: Context) {
    context.inAlg = false;
  }
  static elements = ['EMU-ALG'];
}

function getStepNumbers(item: Element) {
  const { indexOf } = Array.prototype;
  const counts = [];
  while (item.parentElement?.tagName === 'OL') {
    counts.unshift(1 + indexOf.call(item.parentElement.children, item));
    item = item.parentElement.parentElement!;
  }
  return counts;
}
