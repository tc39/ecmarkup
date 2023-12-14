import type { OrderedListItemNode } from 'ecmarkdown';
import type { Reporter } from '../algorithm-error-reporter-type';
import type { Seq } from '../../expr-parser';
import { offsetToLineAndColumn } from '../../utils';

const ruleId = 'algorithm-line-style';

/*
Checks that every algorithm step has one of these forms:

- `If foo, bar.`
- `If foo, then` + substeps
- `If foo, bar, or baz; then` + substeps
- `Else if foo, bar.`
- `Else if foo, then` + substeps
- `Else if foo, bar, or baz; then` + substeps
- `Else, baz.`
- `Else,` + substeps
- `Repeat,` + substeps
- `Repeat, while foo,` + substeps
- `Repeat, until foo,` + substeps
- `For each foo, bar.`
- `For each foo, do` + substeps
- `NOTE: Something.`
- `Assert: Something.`
- `Other.`
- `Other:` + substeps
*/
export default function (
  report: Reporter,
  node: OrderedListItemNode,
  algorithmSource: string,
  parsedSteps: Map<OrderedListItemNode, Seq>
) {
  const stepSeq = parsedSteps.get(node);
  if (stepSeq == null || stepSeq.items.length === 0) {
    return;
  }
  function locate(offset: number) {
    return offsetToLineAndColumn(algorithmSource, offset);
  }

  let last = stepSeq.items[stepSeq.items.length - 1];

  // If the step has a figure, it should end in `:`
  if (last.name === 'figure') {
    last = stepSeq.items[stepSeq.items.length - 2];
    if (!(last.name === 'text' && /:\n +$/.test(last.contents))) {
      report({
        ruleId,
        message: 'expected line with figure to end with ":"',
        ...locate(last.location.end.offset),
      });
    }
    return;
  }

  const hasSubsteps = node.sublist !== null;

  const first = stepSeq.items[0];
  const initialText = first.name === 'text' ? first.contents : '';
  const finalText = last.name === 'text' ? last.contents : '';

  if (/^(?:If |Else if)/.test(initialText)) {
    if (hasSubsteps) {
      if (node.sublist!.name === 'ol') {
        const end = finalText.match(/[,;] then$/);
        if (!end) {
          report({
            ruleId,
            message: `expected "If" with substeps to end with ", then"`,
            ...locate(last.location.end.offset),
          });
        } else if (
          end[0][0] === ';' &&
          !node.contents.some(c => c.name === 'text' && /,/.test(c.contents))
        ) {
          report({
            ruleId,
            message: `expected "If" with substeps to end with ", then" rather than "; then" when there are no other commas`,
            ...locate(last.location.end.offset - 6),
          });
        }
      } else {
        if (!/:$/.test(finalText)) {
          report({
            ruleId,
            message: `expected "If" with list to end with ":"`,
            ...locate(last.location.end.offset),
          });
        }
      }
    } else {
      const lineSource = algorithmSource.slice(
        first.location.start.offset,
        last.location.end.offset
      );
      const ifThenMatch = lineSource.match(/^If[^,\n]+, then /);
      if (ifThenMatch != null) {
        report({
          ruleId,
          message: `single-line "If" steps should not have a "then"`,
          ...locate(first.location.start.offset + ifThenMatch[0].length - 5),
        });
      }
      if (!/(?:\.|\.\)|:)$/.test(finalText)) {
        report({
          ruleId,
          message: `expected "If" without substeps to end with "." or ":"`,
          ...locate(last.location.end.offset),
        });
      }
    }
  } else if (/^Else/.test(initialText)) {
    if (/^Else, if/.test(initialText)) {
      report({
        ruleId,
        message: `prefer "Else if" over "Else, if"`,
        ...locate(first.location.start.offset + 4),
      });
    }
    if (hasSubsteps) {
      if (stepSeq.items.length === 1 && initialText === 'Else,') {
        return;
      }
      if (!/,$/.test(finalText)) {
        report({
          ruleId,
          message: `expected "Else" with substeps to end with ","`,
          ...locate(last.location.end.offset),
        });
      }
    } else {
      if (!/(?:\.|\.\)|:)$/.test(finalText)) {
        report({
          ruleId,
          message: `expected "Else" without substeps to end with "." or ":"`,
          ...locate(last.location.end.offset),
        });
      }
    }
  } else if (/^Repeat\b/.test(initialText)) {
    if (!hasSubsteps) {
      report({
        ruleId,
        line: node.contents[0].location.start.line,
        column: node.contents[0].location.start.column,
        message: 'expected "Repeat" to have substeps',
      });
    }
    if (stepSeq.items.length === 1 && initialText === 'Repeat,') {
      return;
    }
    if (/ times:$/.test(finalText)) {
      return;
    }
    if (!/^Repeat, (?:while|until) /.test(initialText)) {
      report({
        ruleId,
        message: `expected "Repeat" to look like "Repeat _n_ times:", "Repeat, while ..." or "Repeat, until ..."`,
        ...locate(first.location.start.offset),
      });
    }
    if (!/,$/.test(finalText)) {
      report({
        ruleId,
        message: 'expected "Repeat" to end with ","',
        ...locate(last.location.end.offset),
      });
    }
  } else if (/^For each/.test(initialText)) {
    if (hasSubsteps) {
      if (!/, do$/.test(finalText)) {
        report({
          ruleId,
          message: `expected "For each" with substeps to end with ", do"`,
          ...locate(last.location.end.offset),
        });
      }
    } else {
      if (!/(?:\.|\.\))$/.test(finalText)) {
        report({
          ruleId,
          message: `expected "For each" without substeps to end with "."`,
          ...locate(last.location.end.offset),
        });
      }
    }
  } else {
    // these are not else-ifs because we still want to enforce the line-ending rules
    if (/^(NOTE|Assert): [a-z]/.test(initialText)) {
      const kind = initialText.match(/^(NOTE|Assert)/)![1];
      report({
        ruleId,
        message: `the clause after "${kind}:" should begin with a capital letter`,
        ...locate(first.location.start.offset + kind.length + 2),
      });
    }
    if (/^NOTE:/i.test(initialText) && !/^NOTE:/.test(initialText)) {
      report({
        ruleId,
        message: `"NOTE:" should be fully capitalized`,
        ...locate(first.location.start.offset),
      });
    }
    if (/^Assert:/i.test(initialText) && !/^Assert:/.test(initialText)) {
      report({
        ruleId,
        message: `"Assert:" should be capitalized`,
        ...locate(first.location.start.offset),
      });
    }
    if (hasSubsteps) {
      if (!/:$/.test(finalText)) {
        report({
          ruleId,
          message: `expected freeform line with substeps to end with ":"`,
          ...locate(last.location.end.offset),
        });
      }
    } else if (!/(?:\.|\.\))$/.test(finalText)) {
      if (last.name === 'paren' && last.items.length > 0) {
        const lastItem = last.items[last.items.length - 1];
        if (lastItem.name === 'text') {
          return;
        }
      }
      report({
        ruleId,
        message: `expected freeform line to end with "."`,
        ...locate(last.location.end.offset),
      });
    }
  }
}
