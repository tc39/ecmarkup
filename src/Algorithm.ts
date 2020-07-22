import type { Context } from './Context';
import type { Node as EcmarkdownNode, OrderedListItemNode, Observer } from 'ecmarkdown';
import type { StepBiblioEntry } from './Biblio';

import Builder from './Builder';
import { getLocation, ecmarkdownLocationToTrueLocation } from './utils';
import * as emd from 'ecmarkdown';

function findLabeledSteps(root: EcmarkdownNode) {
  let steps: OrderedListItemNode[] = [];
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
  static enter(context: Context) {
    context.inAlg = true;
    const { spec, node } = context;

    let innerHTML = node.innerHTML; // TODO use original slice, forward this from linter

    // prettier-ignore
    const emdTree =
      'ecmarkdownTree' in node
        ? (node as any).ecmarkdownTree
        : emd.parseAlgorithm(innerHTML, { trackPositions: true });

    const rawHtml = emd.emit(emdTree);

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

    if (replaces && node.firstElementChild!.children.length > 1) {
      let labeledSteps = findLabeledSteps(emdTree);
      for (let step of labeledSteps) {
        let nodeLoc = getLocation(spec.dom, node);
        let itemSource = innerHTML.slice(
          step.location!.start.offset,
          step.location!.end.offset
        );
        let offset = itemSource.match(/^\s*\d+\. \[id="/)![0].length;
        let loc = ecmarkdownLocationToTrueLocation(nodeLoc, step.location!.start.line, step.location!.start.column);
        spec.warn({
          ruleId: 'labeled-step-in-replacement',
          nodeType: 'emu-alg',
          message: 'labeling a step in a replacement algorithm which has multiple top-level steps is unsupported because the resulting step number would be ambiguous',
          line: loc.line,
          column: loc.column + offset,
        });
      }
    }

    for (const step of Array.from(node.querySelectorAll('li[id]'))) {
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
