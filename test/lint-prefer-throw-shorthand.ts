import { describe, it, before } from 'node:test';
import {
  assertLint,
  assertLintFree,
  lintLocationMarker as M,
  positioned,
  getBiblio,
} from './utils.ts';
import type { ExportedBiblio } from '../lib/Biblio.js';

const nodeType = 'emu-alg';

describe('prefer-throw-shorthand', () => {
  let throwBiblio: ExportedBiblio;
  before(async () => {
    throwBiblio = await getBiblio(`
      <emu-clause id="sec-throwcompletion" type="abstract operation">
        <h1>
          ThrowCompletion (
            _value_: an ECMAScript language value,
          ): a throw completion
        </h1>
        <dl class="header">
        </dl>
        <emu-alg>
          1. Return Completion Record { [[Type]]: ~throw~, [[Value]]: _value_, [[Target]]: ~empty~ }.
        </emu-alg>
      </emu-clause>
    `);
  });

  it('return ThrowCompletion', async () => {
    await assertLint(
      positioned`<emu-alg>
        1. Let _x_ be *"foo"*.
        1. Return ${M}ThrowCompletion(_x_).
      </emu-alg>`,
      {
        ruleId: 'prefer-throw-shorthand',
        nodeType,
        message: 'prefer "throw _x_" over "return ThrowCompletion(_x_)"',
      },
      { extraBiblios: [throwBiblio] },
    );
  });

  it('return ThrowCompletion in single-line If', async () => {
    await assertLint(
      positioned`<emu-alg>
        1. Let _x_ be *"foo"*.
        1. If _x_ is *"bar"*, return ${M}ThrowCompletion(_x_).
      </emu-alg>`,
      {
        ruleId: 'prefer-throw-shorthand',
        nodeType,
        message: 'prefer "throw _x_" over "return ThrowCompletion(_x_)"',
      },
      { extraBiblios: [throwBiblio] },
    );
  });

  it('throw shorthand is allowed', async () => {
    await assertLintFree(`
      <emu-alg>
        1. Let _x_ be *"foo"*.
        1. Throw _x_.
      </emu-alg>
    `);
  });

  it('ThrowCompletion assigned to alias is allowed', async () => {
    await assertLintFree(
      `
      <emu-alg>
        1. Let _x_ be *"foo"*.
        1. Let _comp_ be ThrowCompletion(_x_).
        1. Return _comp_.
      </emu-alg>
    `,
      { extraBiblios: [throwBiblio] },
    );
  });
});
