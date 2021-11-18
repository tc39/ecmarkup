import type Spec from './Spec';
import type { Context } from './Context';

import Builder from './Builder';

export default class Meta extends Builder {
  static elements = ['EMU-META'];

  static async enter({ spec, node }: Context) {
    spec._emuMetasToRender.add(node);
  }

  static render(spec: Spec, node: HTMLElement) {
    // This builder turns <emu-meta> tags that aren't removed during effect
    // propagation on invocations into <spans> so they are rendered.
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
