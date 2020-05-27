import type { Node as EcmarkdownNode, Observer } from 'ecmarkdown';
import type { LintingError } from '../algorithm-error-reporter-type';

const ruleId = 'algorithm-line-endings';

/*
Checks that every algorithm step has one of these forms:

- `If foo, bar.`
- `If foo, then` + substeps
- `Else if foo, bar.`
- `Else if foo, then` + substeps
- `Else, baz.`
- `Else,` + substeps
- `Repeat,` + substeps
- `Repeat, while foo,` + substeps
- `Repeat, until foo,` + substeps
- `For each foo, bar.`
- `For each foo, do` + substeps
- `Other.`
- `Other:` + substeps
*/
export default function (report: (e: LintingError) => void, node: Element): Observer {
  if (node.getAttribute('type') === 'example') {
    return {};
  }
  const nodeType = node.tagName;
  return {
    enter(node: EcmarkdownNode) {
      if (node.name !== 'ordered-list-item') {
        return;
      }
      let firstIndex = 0;
      while (firstIndex < node.contents.length && node.contents[firstIndex].name === 'tag') {
        ++firstIndex;
      }
      if (firstIndex === node.contents.length) {
        report({
          ruleId,
          nodeType,
          line: node.location!.start.line,
          column: node.location!.start.column,
          message: 'expected line to contain non-tag elements',
        });
        return;
      }
      let first = node.contents[firstIndex];

      let last = node.contents[node.contents.length - 1];

      // Special case: if the step has a figure, it should end in `:`
      if (last.name === 'tag' && last.contents === '</figure>') {
        let count = 1;
        let lastIndex = node.contents.length - 2;
        if (lastIndex < 0) {
          report({
            ruleId,
            nodeType,
            line: node.contents[0].location!.start.line,
            column: node.contents[0].location!.start.column,
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
              nodeType,
              line: node.contents[0].location!.start.line,
              column: node.contents[0].location!.start.column,
              message: 'could not find matching <figure> tag',
            });
            return;
          }
        }
        last = node.contents[lastIndex];
        if (last.name !== 'text') {
          report({
            ruleId,
            nodeType,
            line: last.location!.start.line,
            column: last.location!.start.column,
            message: `expected line to end with text (found ${last.name})`,
          });
          return;
        }
        if (!/:\n +$/.test(last.contents)) {
          report({
            ruleId,
            nodeType,
            line: last.location!.end.line,
            column: last.location!.end.column,
            message: 'expected line with figure to end with ":"',
          });
        }
        return;
      }

      let hasSubsteps = node.sublist !== null;

      // Special case: lines without substeps can end in `pre` tags.
      if (last.name === 'opaqueTag' && /^\s*<pre>/.test(last.contents)) {
        if (hasSubsteps) {
          report({
            ruleId,
            nodeType,
            line: node.contents[0].location!.start.line,
            column: node.contents[0].location!.start.column,
            message: `lines ending in <pre> tags must not have substeps`,
          });
        }
        return;
      }

      if (last.name !== 'text') {
        report({
          ruleId,
          nodeType,
          line: last.location!.start.line,
          column: last.location!.start.column,
          message: `expected line to end with text (found ${last.name})`,
        });
        return;
      }

      let initialText = first.name === 'text' ? first.contents : '';

      if (/^(?:If |Else if)/.test(initialText)) {
        if (hasSubsteps) {
          if (node.sublist!.name === 'ol') {
            if (!/, then$/.test(last.contents)) {
              report({
                ruleId,
                nodeType,
                line: last.location!.end.line,
                column: last.location!.end.column,
                message: `expected "If" with substeps to end with ", then" (found ${JSON.stringify(
                  last.contents
                )})`,
              });
            }
          } else {
            if (!/:$/.test(last.contents)) {
              report({
                ruleId,
                nodeType,
                line: last.location!.end.line,
                column: last.location!.end.column,
                message: `expected "If" with list to end with ":" (found ${JSON.stringify(
                  last.contents
                )})`,
              });
            }
          }
        } else {
          if (!/(?:\.|\.\)|:)$/.test(last.contents)) {
            report({
              ruleId,
              nodeType,
              line: last.location!.end.line,
              column: last.location!.end.column,
              message: `expected "If" without substeps to end with "." or ":" (found ${JSON.stringify(
                last.contents
              )})`,
            });
          }
        }
      } else if (/^Else/.test(initialText)) {
        if (hasSubsteps) {
          if (node.contents.length === 1 && first.contents === 'Else,') {
            return;
          }
          if (!/,$/.test(last.contents)) {
            report({
              ruleId,
              nodeType,
              line: last.location!.end.line,
              column: last.location!.end.column,
              message: `expected "Else" with substeps to end with "," (found ${JSON.stringify(
                last.contents
              )})`,
            });
          }
        } else {
          if (!/(?:\.|\.\)|:)$/.test(last.contents)) {
            report({
              ruleId,
              nodeType,
              line: last.location!.end.line,
              column: last.location!.end.column,
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
            nodeType,
            line: node.contents[0].location!.start.line,
            column: node.contents[0].location!.start.column,
            message: 'expected "Repeat" to have substeps',
          });
        }
        if (node.contents.length === 1 && first.contents === 'Repeat,') {
          return;
        }
        if (!/^Repeat, (?:while|until) /.test(initialText)) {
          report({
            ruleId,
            nodeType,
            line: node.contents[0].location!.start.line,
            column: node.contents[0].location!.start.column,
            message: `expected "Repeat" to start with "Repeat, while " or "Repeat, until " (found ${JSON.stringify(
              initialText
            )})`,
          });
        }
        if (!/,$/.test(last.contents)) {
          report({
            ruleId,
            nodeType,
            line: last.location!.end.line,
            column: last.location!.end.column,
            message: 'expected "Repeat" to end with ","',
          });
        }
      } else if (/^For each/.test(initialText)) {
        if (hasSubsteps) {
          if (!/, do$/.test(last.contents)) {
            report({
              ruleId,
              nodeType,
              line: last.location!.end.line,
              column: last.location!.end.column,
              message: `expected "For each" with substeps to end with ", do" (found ${JSON.stringify(
                last.contents
              )})`,
            });
          }
        } else {
          if (!/(?:\.|\.\))$/.test(last.contents)) {
            report({
              ruleId,
              nodeType,
              line: last.location!.end.line,
              column: last.location!.end.column,
              message: `expected "For each" without substeps to end with "." (found ${JSON.stringify(
                last.contents
              )})`,
            });
          }
        }
      } else {
        if (hasSubsteps) {
          if (!/:$/.test(last.contents)) {
            report({
              ruleId,
              nodeType,
              line: last.location!.end.line,
              column: last.location!.end.column,
              message: `expected freeform line with substeps to end with ":" (found ${JSON.stringify(
                last.contents
              )})`,
            });
          }
        } else if (!/(?:\.|\.\))$/.test(last.contents)) {
          report({
            ruleId,
            nodeType,
            line: last.location!.end.line,
            column: last.location!.end.column,
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
