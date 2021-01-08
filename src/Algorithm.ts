import type { Context } from './Context';
import type { Node as EcmarkdownNode, OrderedListItemNode, Observer } from 'ecmarkdown';
import type { StepBiblioEntry } from './Biblio';

import Builder from './Builder';
import { warnEmdFailure, wrapEmdFailure } from './utils';
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
  static async enter(context: Context) {
    context.inAlg = true;
    const { spec, node, clauseStack } = context;

    let innerHTML = node.innerHTML; // TODO use original slice, forward this from linter

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
      let clause = clauseStack[clauseStack.length - 1];
      let namespace = clause ? clause.namespace : spec.namespace;
      let nonterminals = [];
      emd.visit(emdTree, {
        enter(emdNode: EcmarkdownNode) {
          if (emdNode.name === 'pipe') {
            spec._ntStringRefs.push({
              name: emdNode.nonTerminal,
              loc: {
                line: emdNode.location.start.line,
                column: emdNode.location.start.column + 1, // skip the pipe
              },
              node,
              namespace,
            });
          }
        },
      });
    }

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
        let itemSource = innerHTML.slice(step.location!.start.offset, step.location!.end.offset);
        let offset = itemSource.match(/^\s*\d+\. \[id="/)![0].length;
        spec.warn({
          type: 'contents',
          ruleId: 'labeled-step-in-replacement',
          message:
            'labeling a step in a replacement algorithm which has multiple top-level steps is unsupported because the resulting step number would be ambiguous',
          node,
          nodeRelativeLine: step.location!.start.line,
          nodeRelativeColumn: step.location!.start.column + offset,
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
