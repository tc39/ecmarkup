import { describe, it } from 'node:test';
import { assertLint, assertLintFree, lintLocationMarker as M, positioned } from './utils.ts';

const nodeType = 'emu-alg';
const ruleId = 'algorithm-spelling';

describe('algorithm spelling', () => {
  it('empty string literal', async () => {
    await assertLint(
      positioned`<emu-alg>
        1. Let _x_ be *"foo"*.
        1. If _x_ is ${M}*""*, return _x_.
      </emu-alg>`,
      {
        ruleId: 'prefer-empty-string',
        nodeType,
        message: 'prefer "the empty String" over *""*',
      },
    );
  });

  it('empty string literal in AO argument list is allowed', async () => {
    await assertLintFree(`
      <emu-clause id="sec-some-operation" type="abstract operation">
        <h1>SomeOperation ( _v_ )</h1>
        <dl class="header">
          <dt>description</dt><dd>Example.</dd>
        </dl>
        <emu-alg>
          1. Return _v_.
        </emu-alg>
      </emu-clause>
      <emu-clause id="sec-caller" type="abstract operation">
        <h1>Caller ( )</h1>
        <dl class="header">
          <dt>description</dt><dd>Example.</dd>
        </dl>
        <emu-alg>
          1. Let _x_ be SomeOperation(*""*).
          1. Return _x_.
        </emu-alg>
      </emu-clause>
    `);
  });

  it('increment', async () => {
    await assertLint(
      positioned`<emu-alg>
        1. Let _k_ be 0.
        1. ${M}Increment _k_.
      </emu-alg>`,
      {
        ruleId,
        nodeType,
        message: 'prefer "set _x_ to _x_ + 1" over "increment"',
      },
    );
  });

  it('decrement', async () => {
    await assertLint(
      positioned`<emu-alg>
        1. Let _k_ be 0.
        1. ${M}Decrement _k_.
      </emu-alg>`,
      {
        ruleId,
        nodeType,
        message: 'prefer "set _x_ to _x_ - 1" over "decrement"',
      },
    );
  });

  it('increase', async () => {
    await assertLint(
      positioned`<emu-alg>
        1. Let _k_ be 0.
        1. Let _n_ be 1.
        1. ${M}Increase _k_ by _n_.
      </emu-alg>`,
      {
        ruleId,
        nodeType,
        message: 'prefer "set _x_ to _x_ + _y_" over "increase _x_"',
      },
    );
  });

  it('decrease', async () => {
    await assertLint(
      positioned`<emu-alg>
        1. Let _k_ be 0.
        1. Let _n_ be 1.
        1. ${M}Decrease _k_ by _n_.
      </emu-alg>`,
      {
        ruleId,
        nodeType,
        message: 'prefer "set _x_ to _x_ - _y_" over "decrease _x_"',
      },
    );
  });

  it('is an element of', async () => {
    await assertLint(
      positioned`<emu-alg>
        1. Let _x_ be *"foo"*.
        1. Let _list_ be a new empty List.
        1. If _x_ ${M}is an element of _list_, return _x_.
      </emu-alg>`,
      {
        ruleId,
        nodeType,
        message: 'prefer "_list_ contains _element_" over "_element_ is an element of _list_"',
      },
    );
  });

  it('is present', async () => {
    await assertLint(
      positioned`<emu-alg>
        1. Let _x_ be *"foo"*.
        1. If _x_.[[Foo]] ${M}is present, return _x_.
      </emu-alg>`,
      {
        ruleId,
        nodeType,
        message: 'prefer "_record_ has a [[Field]] field" over "_record_.[[Field]] is present"',
      },
    );
  });

  it('[[Type]] is', async () => {
    await assertLint(
      positioned`<emu-alg>
        1. Let _x_ be *"foo"*.
        1. If _x_.[[Type]] ${M}is ~throw~, return _x_.
      </emu-alg>`,
      {
        ruleId,
        nodeType,
        message:
          'prefer "is a throw completion", "is a normal completion", etc. over accessing [[Type]]',
      },
    );
  });

  it('is either null or undefined', async () => {
    await assertLint(
      positioned`<emu-alg>
        1. Let _x_ be *"foo"*.
        1. If _x_ ${M}is either null or undefined, return _x_.
      </emu-alg>`,
      {
        ruleId,
        nodeType,
        message: 'prefer "is either undefined or null" for consistency',
      },
    );
  });

  it('is that of', async () => {
    await assertLint(
      positioned`<emu-alg>
        1. Let _list_ be a new empty List.
        1. Let _y_ be a List whose length ${M}is that of _list_.
        1. Return _y_.
      </emu-alg>`,
      {
        ruleId,
        nodeType,
        message: 'prefer "whose _ is _" over "whose _ is that of _"',
      },
    );
  });

  it('are both', async () => {
    await assertLint(
      positioned`<emu-alg>
        1. Let _a_ be *true*.
        1. Let _b_ be *true*.
        1. If _a_ and _b_ ${M}are both *true*, return _a_.
      </emu-alg>`,
      {
        ruleId,
        nodeType,
        message: 'prefer "if _a_ is _c_ and _b_ is _c_" over "if _a_ and _b_ are both _c_"',
      },
    );
  });

  it('or if / and if', async () => {
    await assertLint(
      positioned`<emu-alg>
        1. Let _a_ be *true*.
        1. Let _b_ be *true*.
        1. If _a_ is *true*${M} or if _b_ is *true*, return _a_.
      </emu-alg>`,
      {
        ruleId,
        nodeType,
        message: 'prefer "if _a_ or _b_" over "if _a_ or if _b_" (same for "and")',
      },
    );

    await assertLint(
      positioned`<emu-alg>
        1. Let _a_ be *true*.
        1. Let _b_ be *true*.
        1. If _a_ is *true*${M} and if _b_ is *true*, return _a_.
      </emu-alg>`,
      {
        ruleId,
        nodeType,
        message: 'prefer "if _a_ or _b_" over "if _a_ or if _b_" (same for "and")',
      },
    );
  });

  it('or if / and if with mixed connectives is allowed', async () => {
    await assertLintFree(`
      <emu-alg>
        1. Let _a_ be *true*.
        1. Let _b_ be *true*.
        1. Let _c_ be *true*.
        1. If _a_ is *true* and _b_ is *true* or if _c_ is *true*, return _a_.
        1. If _a_ is *true* or _b_ is *true* and if _c_ is *true*, return _a_.
        1. If _a_ is *true*, or if _b_ is *true* and _c_ is *true*, return _a_.
      </emu-alg>
    `);
  });

  it('a Type value', async () => {
    await assertLint(
      positioned`<emu-alg>
        1. Let _x_ be ${M}a String value.
        1. Return _x_.
      </emu-alg>`,
      {
        ruleId,
        nodeType,
        message:
          'do not say "value" after the name of a spec type when following a determiner: prefer "a String" over "a String value"',
      },
    );

    await assertLint(
      positioned`<emu-alg>
        1. Let _x_ be *"foo"*.
        1. If _x_ is ${M}a Number value, return _x_.
      </emu-alg>`,
      {
        ruleId,
        nodeType,
        message:
          'do not say "value" after the name of a spec type when following a determiner: prefer "a String" over "a String value"',
      },
    );

    await assertLint(
      positioned`<emu-alg>
        1. Let _x_ be ${M}a List value.
        1. Return _x_.
      </emu-alg>`,
      {
        ruleId,
        nodeType,
        message:
          'do not say "value" after the name of a spec type when following a determiner: prefer "a String" over "a String value"',
      },
    );

    await assertLint(
      positioned`<emu-alg>
        1. Let _x_ be ${M}a Completion Record value.
        1. Return _x_.
      </emu-alg>`,
      {
        ruleId,
        nodeType,
        message:
          'do not say "value" after the name of a spec type when following a determiner: prefer "a String" over "a String value"',
      },
    );

    await assertLint(
      positioned`<emu-alg>
        1. Let _x_ be ${M}a Property Descriptor value.
        1. Return _x_.
      </emu-alg>`,
      {
        ruleId,
        nodeType,
        message:
          'do not say "value" after the name of a spec type when following a determiner: prefer "a String" over "a String value"',
      },
    );
  });

  it('NOTE and Assert steps are excluded', async () => {
    // these steps would trigger lints without the NOTE:/Assert: prefix
    await assertLintFree(`
      <emu-alg>
        1. Let _x_ be *"foo"*.
        1. Let _list_ be a new empty List.
        1. NOTE: _x_ is an element of _list_.
        1. Assert: _x_ is either null or undefined.
        1. Return _x_.
      </emu-alg>
    `);

    // verify the same text does trigger lints without the prefix
    await assertLint(
      positioned`<emu-alg>
        1. Let _x_ be *"foo"*.
        1. Let _list_ be a new empty List.
        1. If _x_ ${M}is an element of _list_, return _x_.
      </emu-alg>`,
      {
        ruleId,
        nodeType,
        message: 'prefer "_list_ contains _element_" over "_element_ is an element of _list_"',
      },
    );

    await assertLint(
      positioned`<emu-alg>
        1. Let _x_ be *"foo"*.
        1. If _x_ ${M}is either null or undefined, return _x_.
      </emu-alg>`,
      {
        ruleId,
        nodeType,
        message: 'prefer "is either undefined or null" for consistency',
      },
    );
  });

  it('negative', async () => {
    await assertLintFree(`
      <emu-alg>
        1. Let _x_ be *"foo"*.
        1. Let _list_ be a new empty List.
        1. Let _n_ be 1.
        1. Let _a_ be *true*.
        1. Let _b_ be *false*.
        1. If _x_ is the empty String, return _x_.
        1. Set _x_ to _x_ + 1.
        1. If _list_ contains _x_, return _x_.
        1. If _x_ has a [[Foo]] field, return _x_.
        1. If _x_ is a throw completion, return _x_.
        1. If _x_ is either undefined or null, return _x_.
        1. Let _y_ be a List whose length is _n_.
        1. If _a_ is *true* and _b_ is *true*, return _a_.
        1. If _a_ is *true* or _b_ is *true*, return _a_.
        1. If _a_ is a String, return _a_.
        1. Let _z_ be a Number.
        1. Return « _y_, _z_ ».
      </emu-alg>
    `);
  });
});
