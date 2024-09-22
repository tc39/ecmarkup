import type { Context } from './Context';
import type { Node as EcmarkdownNode, OrderedListItemNode, AlgorithmNode } from 'ecmarkdown';
import type { PartialBiblioEntry, StepBiblioEntry } from './Biblio';

import Builder from './Builder';
import { SPECIAL_KINDS_MAP, SPECIAL_KINDS } from './Clause';
import { warnEmdFailure, wrapEmdFailure } from './utils';
import { collectNonterminalsFromEmd } from './lint/utils';
import * as emd from 'ecmarkdown';

function findLabeledSteps(root: EcmarkdownNode) {
  const steps: OrderedListItemNode[] = [];
  emd.visit(root, {
    enter(node: EcmarkdownNode) {
      if (node.name === 'ordered-list-item' && node.attrs.some(a => a.key === 'id')) {
        steps.push(node);
      }
    },
  });
  return steps;
}

const kindSelector = SPECIAL_KINDS.map(kind => `li[${kind}]`).join(',');

export type AlgorithmElementWithTree = HTMLElement & {
  // null means a failed parse
  ecmarkdownTree: AlgorithmNode | null;
  originalHtml: string;
};

export default class Algorithm extends Builder {
  static async enter(context: Context) {
    context.inAlg = true;
    const { spec, node, clauseStack } = context;

    let emdTree: AlgorithmNode | null = null;
    let innerHTML;
    if ('ecmarkdownTree' in node) {
      emdTree = (node as AlgorithmElementWithTree).ecmarkdownTree;
      innerHTML = (node as AlgorithmElementWithTree).originalHtml;
    } else {
      const location = spec.locate(node);
      const source =
        location?.source == null || location.endTag == null
          ? node.innerHTML
          : location.source.slice(location.startTag.endOffset, location.endTag.startOffset);
      innerHTML = source;
      try {
        emdTree = emd.parseAlgorithm(source);
        (node as AlgorithmElementWithTree).ecmarkdownTree = emdTree;
        (node as AlgorithmElementWithTree).originalHtml = source;
      } catch (e) {
        warnEmdFailure(spec.warn, node, e as SyntaxError);
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
    let html = rawHtml.replace(/((?:\s+|>)[!?])[ \t]+/g, '$1&nbsp;');
    // replace spaces before »/} with &nbsp; to prevent bad line breaking
    html = html.replace(/[ \t]+([»}])/g, '&nbsp;$1');
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
        const offset = itemSource.match(/^.*?[ ,[]id *= *"/)![0].length;
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
        stepNumbers: getStepNumbers(step),
      };
      context.spec.biblio.add(entry);
      if (replaces) {
        // The biblio entries for labeled steps in replacement algorithms will be modified in-place by a subsequent pass
        labeledStepEntries.push(entry as StepBiblioEntry);
        context.spec.labeledStepsToBeRectified.add(step.id);
      }
    }

    for (const step of node.querySelectorAll(kindSelector)) {
      // prettier-ignore
      const attributes = SPECIAL_KINDS
        .filter(kind => step.hasAttribute(kind))
        .map(kind => SPECIAL_KINDS_MAP.get(kind));
      const tag = spec.doc.createElement('div');
      tag.className = 'attributes-tag';
      const text = attributes.join(', ');
      const contents = spec.doc.createTextNode(text);
      tag.append(contents);
      step.prepend(tag);

      // we've already walked past the text node, so it won't get picked up by the usual process for autolinking
      const clause = clauseStack[clauseStack.length - 1];
      if (clause != null) {
        // the `== null` case only happens if you put an algorithm at the top level of your document
        spec._textNodes[clause.namespace] = spec._textNodes[clause.namespace] || [];
        spec._textNodes[clause.namespace].push({
          node: contents,
          clause,
          inAlg: true,
          currentId: context.currentId,
        });
      }
    }
  }

  static exit(context: Context) {
    context.inAlg = false;
  }

  static readonly elements = ['EMU-ALG'] as const;
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
