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
  stepSeq: Seq | null,
  node: OrderedListItemNode,
  algorithmSource: string
) {
  if (stepSeq == null || stepSeq.items.length === 0) {
    return;
  }
  function locate(offset: number) {
    return offsetToLineAndColumn(algorithmSource, offset);
  }

  let last = stepSeq.items[stepSeq.items.length - 1];

  // If the step has a figure, it should end in `:`
  if (last.type === 'figure') {
    last = stepSeq.items[stepSeq.items.length - 2];
    if (
      !(last.type === 'fragment' && last.frag.name === 'text' && /:\n +$/.test(last.frag.contents))
    ) {
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
  const initialText =
    first.type === 'fragment' && first.frag.name === 'text' ? first.frag.contents : '';
  const finalText = last.type === 'fragment' && last.frag.name === 'text' ? last.frag.contents : '';

  if (/^(?:If |Else if)/.test(initialText)) {
    if (hasSubsteps) {
      if (node.sublist!.name === 'ol') {
        const end = finalText.match(/[,;] then$/);
        if (!end) {
          report({
            ruleId,
            message: `expected "If" with substeps to end with ", then"`,
            ...locate(last.end),
          });
        } else if (
          end[0][0] === ';' &&
          !node.contents.some(c => c.name === 'text' && /,/.test(c.contents))
        ) {
          report({
            ruleId,
            message: `expected "If" with substeps to end with ", then" rather than "; then" when there are no other commas`,
            ...locate(last.end - 6),
          });
        }
      } else {
        if (!/:$/.test(finalText)) {
          report({
            ruleId,
            message: `expected "If" with list to end with ":"`,
            ...locate(last.end),
          });
        }
      }
    } else {
      const lineSource = algorithmSource.slice(first.start, last.end);
      const ifThenMatch = lineSource.match(/^If[^,\n]+, then /);
      if (ifThenMatch != null) {
        report({
          ruleId,
          message: `single-line "If" steps should not have a "then"`,
          ...locate(first.start + ifThenMatch[0].length - 5),
        });
      }
      if (!/(?:\.|\.\)|:)$/.test(finalText)) {
        report({
          ruleId,
          message: `expected "If" without substeps to end with "." or ":"`,
          ...locate(last.end),
        });
      }
    }
  } else if (/^Else/.test(initialText)) {
    if (/^Else, if/.test(initialText)) {
      report({
        ruleId,
        message: `prefer "Else if" over "Else, if"`,
        ...locate(first.start + 4),
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
          ...locate(last.end),
        });
      }
    } else {
      if (!/(?:\.|\.\)|:)$/.test(finalText)) {
        report({
          ruleId,
          message: `expected "Else" without substeps to end with "." or ":"`,
          ...locate(last.end),
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
    if (!/^Repeat, (?:while|until) /.test(initialText)) {
      report({
        ruleId,
        message: `expected "Repeat" to start with "Repeat, while " or "Repeat, until "`,
        ...locate(first.start),
      });
    }
    if (!/,$/.test(finalText)) {
      report({
        ruleId,
        message: 'expected "Repeat" to end with ","',
        ...locate(last.end),
      });
    }
  } else if (/^For each/.test(initialText)) {
    if (hasSubsteps) {
      if (!/, do$/.test(finalText)) {
        report({
          ruleId,
          message: `expected "For each" with substeps to end with ", do"`,
          ...locate(last.end),
        });
      }
    } else {
      if (!/(?:\.|\.\))$/.test(finalText)) {
        report({
          ruleId,
          message: `expected "For each" without substeps to end with "."`,
          ...locate(last.end),
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
        ...locate(first.start + kind.length + 2),
      });
    }
    if (/^NOTE:/i.test(initialText) && !/^NOTE:/.test(initialText)) {
      report({
        ruleId,
        message: `"NOTE:" should be fully capitalized`,
        ...locate(first.start),
      });
    }
    if (/^Assert:/i.test(initialText) && !/^Assert:/.test(initialText)) {
      report({
        ruleId,
        message: `"Assert:" should be capitalized`,
        ...locate(first.start),
      });
    }
    if (hasSubsteps) {
      if (!/:$/.test(finalText)) {
        report({
          ruleId,
          message: `expected freeform line with substeps to end with ":"`,
          ...locate(last.end),
        });
      }
    } else if (!/(?:\.|\.\))$/.test(finalText)) {
      if (last.type === 'paren' && last.items.length > 0) {
        const lastItem = last.items[last.items.length - 1];
        if (lastItem.type === 'fragment' && lastItem.frag.name === 'text') {
          return;
        }
      }
      report({
        ruleId,
        message: `expected freeform line to end with "."`,
        ...locate(last.end),
      });
    }
  }
}
