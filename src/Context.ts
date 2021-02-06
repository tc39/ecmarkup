import type Spec from './Spec';
import type Import from './Import';
import type Clause from './Clause';
import type { ClauseNumberIterator } from './clauseNums';

export interface Context {
  spec: Spec;
  node: HTMLElement;
  importStack: Import[];
  clauseStack: Clause[];
  tagStack: HTMLElement[];
  clauseNumberer: ClauseNumberIterator;
  inNoAutolink: boolean;
  inNoEmd: boolean;
  inAlg: boolean;
  followingEmd: Node | null;
  currentId: string | null;
}
