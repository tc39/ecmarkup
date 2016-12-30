import Spec from './Spec';
import Import from './Import';
import Clause from './Clause';
import Xref from './Xref';
import { ClauseNumberIterator } from './clauseNums';

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
  startEmd: Node | null;
  currentId: string | null;
}