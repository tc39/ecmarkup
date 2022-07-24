import type Clause from './Clause';
import type { Spec } from './ecmarkup';

/*@internal*/
export interface ClauseNumberIterator {
  next(clauseStack: Clause[], node: HTMLElement): string;
}

/*@internal*/
export default function iterator(spec: Spec): ClauseNumberIterator {
  const ids: (string | number)[] = [];
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

      return ids.join('.');
    },
  };

  function nextAnnexNum(clauseStack: Clause[], node: HTMLElement): string | number {
    const level = clauseStack.length;
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
      return String.fromCharCode((<string>ids[0]).charCodeAt(0) + 1);
    }

    return nextClauseNum(clauseStack, node);
  }

  function nextClauseNum({ length: level }: { length: number }, node: HTMLElement) {
    if (node.hasAttribute('number')) {
      const num = Number(node.getAttribute('number'));
      if (Number.isSafeInteger(num) && num > 0) return num;

      spec.warn({
        type: 'node',
        node,
        ruleId: 'invalid-clause-number',
        message: 'clause numbers must be positive integers',
      });
    }

    if (ids[level] === undefined) return 1;
    return <number>ids[level] + 1;
  }
}
