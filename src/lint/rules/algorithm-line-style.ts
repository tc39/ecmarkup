import type { Node as EcmarkdownNode, Observer } from 'ecmarkdown';
import type { Reporter } from '../algorithm-error-reporter-type';

const ruleId = 'algorithm-line-style';

/*
Checks that every algorithm step has one of these forms:

- `If foo, bar.`
- `If foo, then` + substeps
- `If foo, bar; then` + substeps
- `Else if foo, bar.`
- `Else if foo, then` + substeps
- `Else if foo, bar; then` + substeps
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
export default function (report: Reporter, node: Element, algorithmSource: string): Observer {
  if (node.hasAttribute('example')) {
    return {};
  }
  return {
    enter(node: EcmarkdownNode) {
      if (node.name !== 'ordered-list-item') {
        return;
      }

      let firstIndex = 0;
      let lastIndex = node.contents.length - 1;

      // Special case: ignore <ins>, <del>, or <mark> tags that surround a whole
      // line, and lint the enclosed line as if there were no tag.
      let first = node.contents[firstIndex];
      let last = node.contents[lastIndex];
      while (
        first.name === 'tag' &&
        last.name === 'tag' &&
        ((first.contents === '<mark>' && last.contents === '</mark>') ||
          (first.contents === '<ins>' && last.contents === '</ins>') ||
          (first.contents === '<del>' && last.contents === '</del>'))
      ) {
        ++firstIndex;
        --lastIndex;
        first = node.contents[firstIndex];
        last = node.contents[lastIndex];
      }

      while (firstIndex <= lastIndex && node.contents[firstIndex].name === 'tag') {
        ++firstIndex;
      }
      if (firstIndex > lastIndex) {
        report({
          ruleId,
          line: node.location.start.line,
          column: node.location.start.column,
          message: 'expected line to contain non-tag elements',
        });
        return;
      }
      first = node.contents[firstIndex];
      last = node.contents[lastIndex];

      // Special case: if the step has a figure, it should end in `:`
      if (last.name === 'tag' && last.contents === '</figure>') {
        let count = 1;
        --lastIndex;
        if (lastIndex < 0) {
          report({
            ruleId,
            line: node.contents[0].location.start.line,
            column: node.contents[0].location.start.column,
            message: 'could not find matching <figure> tag',
          });
          return;
        }
        while (count > 0) {
          last = node.contents[lastIndex];
          if (last.name === 'tag') {
            if (last.contents === '<figure>') {
              --count;
            } else if (last.contents === '</figure>') {
              ++count;
            }
          }
          --lastIndex;
          if (lastIndex < 0) {
            report({
              ruleId,
              line: node.contents[0].location.start.line,
              column: node.contents[0].location.start.column,
              message: 'could not find matching <figure> tag',
            });
            return;
          }
        }
        last = node.contents[lastIndex];
        if (last.name !== 'text') {
          report({
            ruleId,
            line: last.location.start.line,
            column: last.location.start.column,
            message: `expected line to end with text (found ${last.name})`,
          });
          return;
        }
        if (!/:\n +$/.test(last.contents)) {
          report({
            ruleId,
            line: last.location.end.line,
            column: last.location.end.column,
            message: 'expected line with figure to end with ":"',
          });
        }
        return;
      }

      const hasSubsteps = node.sublist !== null;

      // Special case: lines without substeps can end in `pre` tags.
      if (last.name === 'opaqueTag' && /^\s*<pre>/.test(last.contents)) {
        if (hasSubsteps) {
          report({
            ruleId,
            line: node.contents[0].location.start.line,
            column: node.contents[0].location.start.column,
            message: `lines ending in <pre> tags must not have substeps`,
          });
        }
        return;
      }

      if (last.name !== 'text') {
        report({
          ruleId,
          line: last.location.start.line,
          column: last.location.start.column,
          message: `expected line to end with text (found ${last.name})`,
        });
        return;
      }

      const initialText = first.name === 'text' ? first.contents : '';

      if (/^(?:If |Else if)/.test(initialText)) {
        if (hasSubsteps) {
          if (node.sublist!.name === 'ol') {
            const end = last.contents.match(/[,;] then$/);
            if (!end) {
              report({
                ruleId,
                line: last.location.end.line,
                column: last.location.end.column,
                message: `expected "If" with substeps to end with ", then" (found ${JSON.stringify(
                  last.contents
                )})`,
              });
            } else if (
              end[0][0] === ';' &&
              !node.contents.some(c => c.name === 'text' && /,/.test(c.contents))
            ) {
              report({
                ruleId,
                line: last.location.end.line,
                column: last.location.end.column - 6,
                message: `expected "If" with substeps to end with ", then" rather than "; then" when there are no other commas`,
              });
            }
          } else {
            if (!/:$/.test(last.contents)) {
              report({
                ruleId,
                line: last.location.end.line,
                column: last.location.end.column,
                message: `expected "If" with list to end with ":" (found ${JSON.stringify(
                  last.contents
                )})`,
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
              line: first.location.start.line,
              column: first.location.start.column + ifThenMatch[0].length - 5,
              message: `single-line "If" steps should not have a "then"`,
            });
          }
          if (!/(?:\.|\.\)|:)$/.test(last.contents)) {
            report({
              ruleId,
              line: last.location.end.line,
              column: last.location.end.column,
              message: `expected "If" without substeps to end with "." or ":" (found ${JSON.stringify(
                last.contents
              )})`,
            });
          }
        }
      } else if (/^Else/.test(initialText)) {
        if (/^Else, if/.test(initialText)) {
          report({
            ruleId,
            line: first.location.start.line,
            column: first.location.start.column + 4, // "Else".length === 4
            message: `prefer "Else if" over "Else, if"`,
          });
        }
        if (hasSubsteps) {
          if (node.contents.length === 1 && first.contents === 'Else,') {
            return;
          }
          if (!/,$/.test(last.contents)) {
            report({
              ruleId,
              line: last.location.end.line,
              column: last.location.end.column,
              message: `expected "Else" with substeps to end with "," (found ${JSON.stringify(
                last.contents
              )})`,
            });
          }
        } else {
          if (!/(?:\.|\.\)|:)$/.test(last.contents)) {
            report({
              ruleId,
              line: last.location.end.line,
              column: last.location.end.column,
              message: `expected "Else" without substeps to end with "." or ":" (found ${JSON.stringify(
                last.contents
              )})`,
            });
          }
        }
      } else if (/^Repeat/.test(initialText)) {
        if (!hasSubsteps) {
          report({
            ruleId,
            line: node.contents[0].location.start.line,
            column: node.contents[0].location.start.column,
            message: 'expected "Repeat" to have substeps',
          });
        }
        if (node.contents.length === 1 && first.contents === 'Repeat,') {
          return;
        }
        if (!/^Repeat, (?:while|until) /.test(initialText)) {
          report({
            ruleId,
            line: node.contents[0].location.start.line,
            column: node.contents[0].location.start.column,
            message: `expected "Repeat" to start with "Repeat, while " or "Repeat, until " (found ${JSON.stringify(
              initialText
            )})`,
          });
        }
        if (!/,$/.test(last.contents)) {
          report({
            ruleId,
            line: last.location.end.line,
            column: last.location.end.column,
            message: 'expected "Repeat" to end with ","',
          });
        }
      } else if (/^For each/.test(initialText)) {
        if (hasSubsteps) {
          if (!/, do$/.test(last.contents)) {
            report({
              ruleId,
              line: last.location.end.line,
              column: last.location.end.column,
              message: `expected "For each" with substeps to end with ", do" (found ${JSON.stringify(
                last.contents
              )})`,
            });
          }
        } else {
          if (!/(?:\.|\.\))$/.test(last.contents)) {
            report({
              ruleId,
              line: last.location.end.line,
              column: last.location.end.column,
              message: `expected "For each" without substeps to end with "." (found ${JSON.stringify(
                last.contents
              )})`,
            });
          }
        }
      } else {
        // these are not else-ifs because we still want to enforce the line-ending rules
        if (/^(NOTE|Assert): [a-z]/.test(initialText)) {
          const kind = initialText.match(/^(NOTE|Assert)/)![1];
          report({
            ruleId,
            line: first.location.start.line,
            column: first.location.start.column + kind.length + 2,
            message: `the clause after "${kind}:" should begin with a capital letter`,
          });
        }
        if (/^NOTE:/i.test(initialText) && !/^NOTE:/.test(initialText)) {
          report({
            ruleId,
            line: first.location.start.line,
            column: first.location.start.column,
            message: `"NOTE:" should be fully capitalized`,
          });
        }
        if (/^Assert:/i.test(initialText) && !/^Assert:/.test(initialText)) {
          report({
            ruleId,
            line: first.location.start.line,
            column: first.location.start.column,
            message: `"Assert:" should be capitalized`,
          });
        }
        if (hasSubsteps) {
          if (!/:$/.test(last.contents)) {
            report({
              ruleId,
              line: last.location.end.line,
              column: last.location.end.column,
              message: `expected freeform line with substeps to end with ":" (found ${JSON.stringify(
                last.contents
              )})`,
            });
          }
        } else if (!/(?:\.|\.\))$/.test(last.contents)) {
          report({
            ruleId,
            line: last.location.end.line,
            column: last.location.end.column,
            message: `expected freeform line to end with "." (found ${JSON.stringify(
              last.contents
            )})`,
          });
        }
      }
      return;
    },
  };
}
