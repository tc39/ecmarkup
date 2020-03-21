/*@internal*/
export interface ClauseNumberIterator {
  next(level: number, annex: boolean): IteratorResult<string>;
}

/*@internal*/
export default function iterator(): ClauseNumberIterator {
  const ids: (string | number)[] = [];
  let inAnnex = false;
  let currentLevel = 0;

  return {
    next(level: number, annex: boolean) {
      if (inAnnex && !annex) throw new Error('Clauses cannot follow annexes');
      if (level - currentLevel > 1) throw new Error('Skipped clause');

      const nextNum = annex ? nextAnnexNum : nextClauseNum;

      if (level === currentLevel) {
        ids[currentLevel] = nextNum(level);
      } else if (level > currentLevel) {
        ids.push(nextNum(level));
      } else {
        ids.length = level + 1;
        ids[level] = nextNum(level);
      }

      currentLevel = level;

      return { value: ids.join('.'), done: false };
    }
  };

  function nextAnnexNum(level: number): string | number {
    if (!inAnnex) {
      if (level > 0) throw new Error('First annex must be at depth 0');
      inAnnex = true;

      return 'A';
    }

    if (level === 0) {
      return String.fromCharCode((<string>ids[0]).charCodeAt(0) + 1);
    }

    return nextClauseNum(level);
  }

  function nextClauseNum(level: number) {
    if (ids[level] === undefined) return 1;
    return (<number>ids[level]) + 1;
  }
}
