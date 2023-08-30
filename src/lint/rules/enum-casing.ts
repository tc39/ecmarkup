import type { Reporter } from '../algorithm-error-reporter-type';
import type { OrderedListItemNode } from 'ecmarkdown';
import { offsetToLineAndColumn } from '../../utils';

const ruleId = 'enum-casing';

/*
Checks that ~enum-values~ are kebab-cased.
*/
export default function (report: Reporter, step: OrderedListItemNode, algorithmSource: string) {
  for (const item of step.contents) {
    if (item.name !== 'tilde' || item.contents.length !== 1 || item.contents[0].name !== 'text') {
      continue;
    }
    const text = item.contents[0];
    if (/[\p{Uppercase_Letter}\s]/u.test(text.contents)) {
      const location = offsetToLineAndColumn(algorithmSource, text.location.start.offset);
      report({
        ruleId,
        message: 'enum values should be lowercase and kebab-cased',
        ...location,
      });
    }
  }
}
