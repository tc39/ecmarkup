import { describe, it } from 'node:test';
import { assertError, positioned, lintLocationMarker as M } from './utils.ts';
import { TypeParser } from '../lib/type-parser.js';
import assert from 'assert';

describe('type parsing', () => {
  describe('errors', () => {
    it('EOF', async () => {
      await assertError(
        positioned`
          <emu-clause id="example" type="abstract operation">
          <h1>
            ExampleAlg (): a normal completion containing${M}
          </h1>
          <dl class="header">
          </dl>
          <emu-alg>
            1. Return NormalCompletion(0).
          </emu-alg>
          </emu-clause>
        `,
        {
          ruleId: 'type-parsing',
          nodeType: 'h1',
          message: 'expected to find a type, got empty string',
        },
      );
    });

    it('duplicate field name', async () => {
      await assertError(
        positioned`
        <emu-clause id="example" type="abstract operation">
        <h1>
          ExampleAlg (): a Record with fields [[A]] and ${M}[[A]]
        </h1>
        <dl class="header">
        </dl>
        <emu-alg>
          1. Return NormalCompletion(0).
        </emu-alg>
        </emu-clause>
      `,
        {
          ruleId: 'type-parsing',
          nodeType: 'h1',
          message: 'duplicate field name "[[A]]"',
        },
      );
    });

    it('ambiguous or', async () => {
      await assertError(
        positioned`
        <emu-clause id="example" type="abstract operation">
        <h1>
          ExampleAlg (): a List of null ${M}or Numbers
        </h1>
        <dl class="header">
        </dl>
        <emu-alg>
          1. Return NormalCompletion(0).
        </emu-alg>
        </emu-clause>
      `,
        {
          ruleId: 'type-parsing',
          nodeType: 'h1',
          message:
            'type is ambiguous; can\'t tell where the "or" attaches (add "either" to disambiguate)',
        },
      );

      await assertError(
        positioned`
        <emu-clause id="example" type="abstract operation">
        <h1>
          ExampleAlg (): ~empty~ or a List of null ${M}or Numbers
        </h1>
        <dl class="header">
        </dl>
        <emu-alg>
          1. Return NormalCompletion(0).
        </emu-alg>
        </emu-clause>
      `,
        {
          ruleId: 'type-parsing',
          nodeType: 'h1',
          message: 'could not determine how to associate "or"; try adding "either"',
        },
      );
    });

    it('error in parameter', async () => {
      await assertError(
        positioned`
          <emu-clause id="example" type="abstract operation">
          <h1>
            ExampleAlg (
              x: a normal completion containing${M},
              y: unknown,
            )
          </h1>
          <dl class="header">
          </dl>
          <emu-alg>
            1. Return NormalCompletion(0).
          </emu-alg>
          </emu-clause>
        `,
        {
          ruleId: 'type-parsing',
          nodeType: 'h1',
          message: 'expected to find a type, got empty string',
        },
      );
    });
  });

  describe('parse trees', () => {
    it('simple cases', () => {
      assert.deepStrictEqual(TypeParser.parse(`~unused~`), {
        kind: 'unused',
      });

      assert.deepStrictEqual(TypeParser.parse(`~empty~`), {
        kind: 'opaque',
        type: '~empty~',
      });

      assert.deepStrictEqual(TypeParser.parse(`X or Y`), {
        kind: 'union',
        types: [
          {
            kind: 'opaque',
            type: 'X',
          },
          {
            kind: 'opaque',
            type: 'Y',
          },
        ],
      });

      assert.deepStrictEqual(TypeParser.parse(`either X or Y`), {
        kind: 'union',
        types: [
          {
            kind: 'opaque',
            type: 'X',
          },
          {
            kind: 'opaque',
            type: 'Y',
          },
        ],
      });

      assert.deepStrictEqual(TypeParser.parse(`one of X, Y, or Z`), {
        kind: 'union',
        types: [
          {
            kind: 'opaque',
            type: 'X',
          },
          {
            kind: 'opaque',
            type: 'Y',
          },
          {
            kind: 'opaque',
            type: 'Z',
          },
        ],
      });

      assert.deepStrictEqual(TypeParser.parse(`a List`), {
        kind: 'list',
        elements: null,
      });

      assert.deepStrictEqual(TypeParser.parse(`a List of X`), {
        kind: 'list',
        elements: {
          kind: 'opaque',
          type: 'X',
        },
      });

      assert.deepStrictEqual(TypeParser.parse(`a Record`), {
        kind: 'opaque',
        type: 'a Record',
      });

      assert.deepStrictEqual(TypeParser.parse(`a Record with fields [[X]] (a Number) and [[Y]]`), {
        kind: 'record',
        fields: {
          __proto__: null,
          '[[X]]': {
            kind: 'opaque',
            type: 'a Number',
          },
          '[[Y]]': null,
        },
      });

      assert.deepStrictEqual(TypeParser.parse(`a List of Lists of X`), {
        kind: 'list',
        elements: {
          kind: 'list',
          elements: {
            kind: 'opaque',
            type: 'X',
          },
        },
      });

      assert.deepStrictEqual(TypeParser.parse(`a List of Records with field [[X]]`), {
        kind: 'list',
        elements: {
          kind: 'record',
          fields: {
            __proto__: null,
            '[[X]]': null,
          },
        },
      });
    });

    it('either disambiguation', () => {
      assert.deepStrictEqual(
        TypeParser.parse(`either a List of either Objects or *null*, or ~empty~`),
        {
          kind: 'union',
          types: [
            {
              kind: 'list',
              elements: {
                kind: 'union',
                types: [
                  {
                    kind: 'opaque',
                    type: 'Objects',
                  },
                  {
                    kind: 'opaque',
                    type: '*null*',
                  },
                ],
              },
            },
            {
              kind: 'opaque',
              type: '~empty~',
            },
          ],
        },
      );
    });

    it('completion joining', () => {
      assert.deepStrictEqual(
        TypeParser.parse(`either a normal completion containing a Boolean or an abrupt completion`),
        {
          kind: 'completion',
          completionType: 'mixed',
          typeOfValueIfNormal: {
            kind: 'opaque',
            type: 'a Boolean',
          },
        },
      );
    });
  });
});
