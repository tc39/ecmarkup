import type { Context } from './Context';
import type { StepBiblioEntry } from './Biblio';

import { logWarning } from './utils';
import Builder from './Builder';
import * as emd from 'ecmarkdown';

/*@internal*/
export default class Algorithm extends Builder {
  static enter(context: Context) {
    context.inAlg = true;
    const { node } = context;

    // prettier-ignore
    const rawHtml =
      'ecmarkdownOut' in node
        ? (node as any).ecmarkdownOut
        : emd.algorithm(node.innerHTML);

    // replace spaces after !/? with &nbsp; to prevent bad line breaking
    const html = rawHtml.replace(/((?:\s+|>)[!?])\s+(\w+\s*\()/g, '$1&nbsp;$2');
    node.innerHTML = html;

    let labeledStepEntries: StepBiblioEntry[] = [];
    let replaces = node.getAttribute('replaces-step');
    if (replaces) {
      context.spec.replacementAlgorithms.push({
        element: node,
        target: replaces,
      });
      context.spec.replacementAlgorithmToContainedLabeledStepEntries.set(node, labeledStepEntries);
    }

    let labeledSteps = Array.from(node.querySelectorAll('li[id]'));
    if (replaces && labeledSteps.length > 0 && node.firstElementChild!.children.length > 1) {
      logWarning(
        'You should not label a step in a replacement algorithm which has multiple top-level steps because the resulting step number could be ambiguous.'
      );
    }

    for (const step of labeledSteps) {
      let entry: StepBiblioEntry = {
        type: 'step',
        id: step.id,
        stepNumbers: getStepNumbers(step as Element),
        referencingIds: [],
      };
      context.spec.biblio.add(entry);
      if (replaces) {
        // The biblio entries for labeled steps in replacement algorithms will be modified in-place by a subsequent pass
        labeledStepEntries.push(entry);
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
  let counts = [];
  while (item.parentElement?.tagName === 'OL') {
    counts.unshift(1 + Array.from(item.parentElement.children).indexOf(item));
    item = item.parentElement.parentElement!;
  }
  return counts;
}
