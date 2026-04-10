import type { Reporter } from '../algorithm-error-reporter-type';
import type { OrderedListItemNode } from 'ecmarkdown';
import type { Seq } from '../../expr-parser';
import { walk as walkExpr } from '../../expr-parser';
import { offsetToLineAndColumn } from '../../utils';

const ruleId = 'algorithm-spelling';

// Note that these will be composed, so cannot contain backreferences
const matchers = [
  {
    pattern: /\b[Ii]ncrement\b/gu,
    message: 'prefer "set _x_ to _x_ + 1" over "increment"',
  },
  {
    pattern: /\b[Dd]ecrement\b/gu,
    message: 'prefer "set _x_ to _x_ - 1" over "decrement"',
  },
  {
    pattern: /\b[Ii]ncrease _/gu,
    message: 'prefer "set _x_ to _x_ + _y_" over "increase _x_"',
  },
  {
    pattern: /\b[Dd]ecrease _/gu,
    message: 'prefer "set _x_ to _x_ - _y_" over "decrease _x_"',
  },
  {
    pattern: /\bis an element of\b/gu,
    message: 'prefer "_list_ contains _element_" over "_element_ is an element of _list_"',
  },
  {
    pattern: /(?<=\.\[\[\w+\]\] )is present\b/gu,
    message: 'prefer "_record_ has a [[Field]] field" over "_record_.[[Field]] is present"',
  },
  {
    pattern: /(?<=\.\[\[Type\]\] )is ~(?:throw|normal|return|continue|break)~/gu,
    message:
      'prefer "is a throw completion", "is a normal completion", etc. over accessing [[Type]]',
  },
  {
    pattern: /\bis either null or undefined\b/gu,
    message: 'prefer "is either undefined or null" for consistency',
  },
  {
    pattern: /\bis that of\b/gu,
    message: 'prefer "whose _ is _" over "whose _ is that of _"',
  },
  {
    pattern: /\bare both\b/gu,
    message: 'prefer "if _a_ is _c_ and _b_ is _c_" over "if _a_ and _b_ are both _c_"',
  },
  {
    pattern:
      /\b(?:a|an) (?:String|Number|Boolean|BigInt|Symbol|Object|List|Record|Set|Relation|Enum|Property Descriptor|(?:Reference|Completion|Environment|ClassFieldDefinition|ClassStaticBlockDefinition) Record|Abstract Closure|PrivateElement) value\b/gu,
    message:
      'do not say "value" after the name of a spec type when following a determiner: prefer "a String" over "a String value"',
  },
];

const composed = new RegExp(matchers.map(m => `(?:${m.pattern.source})`).join('|'), 'u');

export default function (
  report: Reporter,
  step: OrderedListItemNode,
  algorithmSource: string,
  parsedSteps: Map<OrderedListItemNode, Seq>,
) {
  if (step.contents.length === 0) {
    return;
  }
  const stepSource = algorithmSource.slice(
    step.contents[0].location.start.offset,
    step.contents[step.contents.length - 1].location.end.offset,
  );
  if (/^(?:NOTE:|Assert:)/.test(stepSource)) {
    return;
  }

  const baseOffset = step.contents[0].location.start.offset;

  // structural checks using the parsed expression tree
  const stepSeq = parsedSteps.get(step);
  if (stepSeq != null) {
    walkExpr((expr, path) => {
      // check *""* outside of AO argument lists
      if (
        expr.name === 'star' &&
        expr.contents.length === 1 &&
        expr.contents[0].name === 'text' &&
        expr.contents[0].contents === '""'
      ) {
        const inArgList = path.some(p => p.parent.name === 'call' || p.parent.name === 'sdo-call');
        if (!inArgList) {
          report({
            ruleId: 'prefer-empty-string',
            message: 'prefer "the empty String" over *""*',
            ...offsetToLineAndColumn(algorithmSource, expr.location.start.offset),
          });
        }
      }
    }, stepSeq);
  }

  // check "or if" / "and if" — but only when the other connective is not also present
  const orIfPattern = /(?<=\bIf .+) (or|and) if\b/gu;
  let orIfMatch = orIfPattern.exec(stepSource);
  while (orIfMatch !== null) {
    const otherPattern = orIfMatch[1] === 'or' ? /\band\b/ : /\bor\b/;
    if (!otherPattern.test(stepSource)) {
      report({
        ruleId,
        message: 'prefer "if _a_ or _b_" over "if _a_ or if _b_" (same for "and")',
        ...offsetToLineAndColumn(algorithmSource, baseOffset + orIfMatch.index),
      });
    }
    orIfMatch = orIfPattern.exec(stepSource);
  }

  if (!composed.test(stepSource)) {
    return;
  }
  for (const { pattern, message } of matchers) {
    let match = pattern.exec(stepSource);
    while (match !== null) {
      report({
        ruleId,
        message,
        ...offsetToLineAndColumn(algorithmSource, baseOffset + match.index),
      });
      match = pattern.exec(stepSource);
    }
  }
}
