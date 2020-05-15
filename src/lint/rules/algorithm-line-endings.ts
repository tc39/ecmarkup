import type { Node as EcmarkdownNode, Observer } from 'ecmarkdown';
import type { Reporter } from '../algorithm-error-reporter-type';

/*
Checks that every algorithm step has one of these forms:

- `If foo, bar.`
- `If foo, then,` + substeps
- `Else if foo, bar.`
- `Else if foo, then.` + substeps
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
export default function (report: Reporter, node: Element): Observer {
  if (node.getAttribute('type') === 'example') {
    return {};
  }
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
            line: node.contents[0].location!.start.line,
            column: node.contents[0].location!.start.column,
            message: `expected line to end with text (found ${last.name})`,
          });
          return;
        }
        if (!/:\n +$/.test(last.contents)) {
          report({
            line: node.contents[0].location!.start.line,
            column: node.contents[0].location!.start.column,
            message: 'expected line with figure to end with ":"',
          });
        }
        return;
      }

      if (last.name !== 'text') {
        report({
          line: node.contents[0].location!.start.line,
          column: node.contents[0].location!.start.column,
          message: `expected line to end with text (found ${last.name})`,
        });
        return;
      }

      let initialText = first.name === 'text' ? first.contents : '';
      let hasSubsteps = node.sublist !== null;

      if (/^(?:If |Else if)/.test(initialText)) {
        if (hasSubsteps) {
          if (node.sublist!.name === 'ol') {
            if (!/, then$/.test(last.contents)) {
              report({
                line: node.contents[0].location!.start.line,
                column: node.contents[0].location!.start.column,
                message: `expected "If" with substeps to end with ", then" (found "${last.contents}")`,
              });
            }
          } else {
            if (!/:$/.test(last.contents)) {
              report({
                line: node.contents[0].location!.start.line,
                column: node.contents[0].location!.start.column,
                message: `expected "If" with list to end with ":" (found "${last.contents}")`,
              });
            }
          }
        } else {
          if (!/(?:\.|\.\)|:)$/.test(last.contents)) {
            report({
              line: node.contents[0].location!.start.line,
              column: node.contents[0].location!.start.column,
              message: `expected "If" without substeps to end with "." or ":" (found "${last.contents}")`,
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
              line: node.contents[0].location!.start.line,
              column: node.contents[0].location!.start.column,
              message: `expected "Else" with substeps to end with "," (found "${last.contents}")`,
            });
          }
        } else {
          if (!/(?:\.|\.\)|:)$/.test(last.contents)) {
            report({
              line: node.contents[0].location!.start.line,
              column: node.contents[0].location!.start.column,
              message: `expected "Else" without substeps to end with "." or ":" (found "${last.contents}")`,
            });
          }
        }
      } else if (/^Repeat/.test(initialText)) {
        if (!hasSubsteps) {
          report({
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
            line: node.contents[0].location!.start.line,
            column: node.contents[0].location!.start.column,
            message: `expected "Repeat" to start with "Repeat, while " or "Repeat, until " (found "${initialText}")`,
          });
        }
        if (!/,$/.test(last.contents)) {
          report({
            line: node.contents[0].location!.start.line,
            column: node.contents[0].location!.start.column,
            message: 'expected "Repeat" to end with ","',
          });
        }
      } else if (/^For each/.test(initialText)) {
        if (hasSubsteps) {
          if (!/, do$/.test(last.contents)) {
            report({
              line: node.contents[0].location!.start.line,
              column: node.contents[0].location!.start.column,
              message: `expected "For each" with substeps to end with ", do" (found "${last.contents}")`,
            });
          }
        } else {
          if (!/(?:\.|\.\))$/.test(last.contents)) {
            report({
              line: node.contents[0].location!.start.line,
              column: node.contents[0].location!.start.column,
              message: `expected "For each" without substeps to end with "." (found "${last.contents}")`,
            });
          }
        }
      } else {
        if (hasSubsteps) {
          if (!/:$/.test(last.contents)) {
            report({
              line: node.contents[0].location!.start.line,
              column: node.contents[0].location!.start.column,
              message: `expected freeform line with substeps to end with ":" (found "${last.contents}")`,
            });
          }
        } else if (!/(?:\.|\.\))$/.test(last.contents)) {
          report({
            line: node.contents[0].location!.start.line,
            column: node.contents[0].location!.start.column,
            message: `expected freeform line to end with "." (found "${last.contents}")`,
          });
        }
      }
      return;
    },
  };
}
