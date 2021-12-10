import type Spec from './Spec';
import type { Context } from './Context';

import Builder from './Builder';

import { validateEffects } from './utils';

export default class Meta extends Builder {
  static elements = ['EMU-META'];

  static async enter({ spec, node, clauseStack }: Context) {
    const parent = clauseStack[clauseStack.length - 1] || null;
    if (node.hasAttribute('effects') && parent !== null) {
      const effects = validateEffects(
        spec,
        node
          .getAttribute('effects')!
          .split(',')
          .map(c => c.trim()),
        node
      );
      for (const effect of effects) {
        if (!parent.effects.includes(effect)) {
          parent.effects.push(effect);
          if (!spec._effectWorklist.has(effect)) {
            spec._effectWorklist.set(effect, []);
          }
          spec._effectWorklist.get(effect)!.push(parent);
        }
      }
    }
    spec._emuMetasToRender.add(node);
  }

  static render(spec: Spec, node: HTMLElement) {
    // This builder turns <emu-meta> tags that aren't removed during effect
    // propagation on invocations into <span>s so they are rendered.
    if (node.hasAttribute('effects')) {
      const classNames = node
        .getAttribute('effects')!
        .split(',')
        .map(e => `e-${e}`)
        .join(' ');
      const span = spec.doc.createElement('span');
      span.setAttribute('class', classNames);
      while (node.firstChild) {
        span.appendChild(node.firstChild);
      }
      node.replaceWith(span);
    }
  }
}
