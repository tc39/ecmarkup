import type Spec from './Spec';
import type { Context } from './Context';

// We use this instead of `typeof Builder` because using the class as the type also requires derived constructors to be subtypes of the base constructor, which is irritating.
/*@internal*/
export interface BuilderInterface {
  elements: string[];
  enter(context: Context): void;
  exit(context: Context): void;
}

/*@internal*/
export default class Builder {
  public spec: Spec;
  public node: HTMLElement;

  constructor(spec: Spec, node: HTMLElement) {
    this.spec = spec;
    this.node = node;

    let nodeId = node.getAttribute('id')!;

    if (nodeId !== null) {
      if (spec.nodeIds.has(nodeId)) {
        spec.warn({
          type: 'attr-value',
          attr: 'id',
          ruleId: 'duplicate-id',
          message: `<${node.tagName.toLowerCase()}> has duplicate id ${JSON.stringify(nodeId)}`,
          node,
        });
      }
      spec.nodeIds.add(nodeId);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  static async enter(context: Context) {
    throw new Error('Builder not implemented');
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  static exit(context: Context): void {}
  static elements: string[] = [];
}
