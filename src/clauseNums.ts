import type Clause from './Clause';
import type { Spec } from './ecmarkup';

/*@internal*/
export interface ClauseNumberIterator {
  next(clauseStack: Clause[], node: HTMLElement): string;
}

/*@internal*/
export default function iterator(spec: Spec): ClauseNumberIterator {
  const ids: (string | number[])[] = [];
  let inAnnex = false;
  let currentLevel = 0;

  return {
    next(clauseStack: Clause[], node: HTMLElement) {
      const annex = node.nodeName === 'EMU-ANNEX';
      const level = clauseStack.length;
      if (inAnnex && !annex) {
        spec.warn({
          type: 'node',
          node,
          ruleId: 'clause-after-annex',
          message: 'clauses cannot follow annexes',
        });
      }
      if (level - currentLevel > 1) {
        spec.warn({
          type: 'node',
          node,
          ruleId: 'skipped-caluse',
          message: 'clause is being numbered without numbering its parent clause',
        });
      }

      const nextNum = annex ? nextAnnexNum : nextClauseNum;

      if (level === currentLevel) {
        ids[currentLevel] = nextNum(clauseStack, node);
      } else if (level > currentLevel) {
        ids.push(nextNum(clauseStack, node));
      } else {
        ids.length = level + 1;
        ids[level] = nextNum(clauseStack, node);
      }

      currentLevel = level;

      return ids.flat().join('.');
    },
  };

  function nextAnnexNum(clauseStack: Clause[], node: HTMLElement): string | number[] {
    const level = clauseStack.length;
    if (level === 0 && node.hasAttribute('number')) {
      spec.warn({
        type: 'attr',
        node,
        attr: 'number',
        ruleId: 'annex-clause-number',
        message:
          'top-level annexes do not support explicit numbers; if you need this, open a bug on ecmarkup',
      });
    }
    if (!inAnnex) {
      if (level > 0) {
        spec.warn({
          type: 'node',
          node,
          ruleId: 'annex-depth',
          message: 'first annex must be at depth 0',
        });
      }
      inAnnex = true;

      return 'A';
    }

    if (level === 0) {
      return String.fromCharCode((ids[0] as string).charCodeAt(0) + 1);
    }

    return nextClauseNum(clauseStack, node);
  }

  function nextClauseNum({ length: level }: { length: number }, node: HTMLElement) {
    if (node.hasAttribute('number')) {
      const nums = node
        .getAttribute('number')!
        .split('.')
        .map(n => Number(n));
      if (nums.length === 0 || nums.some(num => !Number.isSafeInteger(num) || num <= 0)) {
        spec.warn({
          type: 'attr-value',
          node,
          attr: 'number',
          ruleId: 'invalid-clause-number',
          message: 'clause numbers must be positive integers or dotted lists of positive integers',
        });
      }
      if (ids[level] !== undefined) {
        if (nums.length !== ids[level].length) {
          spec.warn({
            type: 'attr-value',
            node,
            attr: 'number',
            ruleId: 'invalid-clause-number',
            message:
              'multi-step explicit clause numbers should not be mixed with single-step clause numbers in the same parent clause',
          });
        } else {
          // Make sure that `nums` is strictly greater than `ids[level]` (i.e.,
          // that their items are not identical and that the item in `nums` is
          // strictly greater than the value in `ids[level]` at the first
          // index where they differ).
          const i = nums.findIndex((num, i) => num !== ids[level][i]);
          if (i < 0 || !(nums[i] > (ids[level] as number[])[i])) {
            spec.warn({
              type: 'attr-value',
              node,
              attr: 'number',
              ruleId: 'invalid-clause-number',
              message: 'clause numbers should be strictly increasing',
            });
          }
        }
      }
      return nums;
    }

    if (ids[level] === undefined) return [1];
    const head = (ids[level] as number[]).slice(0, -1);
    const tail = (ids[level] as number[])[ids[level].length - 1];
    return [...head, tail + 1];
  }
}
