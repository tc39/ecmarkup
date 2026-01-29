import { describe, it, before } from 'node:test';
import {
  assertLint,
  positioned,
  lintLocationMarker as M,
  assertLintFree,
  getBiblio,
} from './utils.ts';
import { parse as parseExpr } from '../lib/expr-parser.js';
import assert from 'assert';
import { parseFragment } from 'ecmarkdown';
import type { ExportedBiblio } from '../lib/Biblio.js';

describe('expression parsing', () => {
  describe('valid', () => {
    it('lists', async () => {
      await assertLintFree(`
        <emu-alg>
          1. Let _x_ be «».
          1. Set _x_ to « ».
          1. Set _x_ to «0».
          1. Set _x_ to «0, 1».
          1. Set _x_ to « 0,1 ».
        </emu-alg>
      `);
    });

    it('calls', async () => {
      await assertLintFree(`
        <emu-alg>
          1. Let _foo_ be a variable.
          1. Let _x_ be _foo_().
          1. Set _x_ to _foo_( ).
          1. Set _x_ to _foo_.[[Bar]]().
          1. Set _x_ to _foo_(0).
          1. Set _x_ to _foo_( 0 ).
          1. Set _x_ to _foo_(0, 1).
        </emu-alg>
      `);
    });

    it('records', async () => {
      await assertLintFree(`
        <emu-alg>
          1. Let _x_ be { [[x]]: 0 }.
          1. Set _x_ to {[[x]]:0}.
        </emu-alg>
      `);
    });

    it('record-spec', async () => {
      await assertLintFree(`
        <emu-alg>
          1. Let _entries_ be a List.
          1. For each Record { [[Key]], [[Value]] } _p_ of _entries_, do
            1. Use _p_.
        </emu-alg>
      `);
    });

    it('trailing comma in multi-line list', async () => {
      await assertLintFree(`
        <emu-alg>
        1. Let _x_ be «
            0,
            1,
          ».
        1. Use _x_.
        </emu-alg>
      `);
    });

    it('trailing comma in multi-line call', async () => {
      await assertLintFree(`
        <emu-alg>
        1. Let _foo_ be a function.
        1. Let _x_ be _foo_(
            0,
            1,
          ).
        1. Use _x_.
        </emu-alg>
      `);
    });

    it('trailing comma in multi-line record', async () => {
      await assertLintFree(`
        <emu-alg>
        1. Let _x_ be the Record {
            [[X]]: 0,
            [[Y]]: 1,
          }.
        1. Use _x_.
        </emu-alg>
      `);
    });

    it('tags in record', async () => {
      await assertLintFree(`
        <emu-alg>
        1. Let _x_ be a new Record { [[Foo]]: 0, <!-- comment --> [[Bar]]: 1 }.
        1. Set _x_ to a new Record { [[Foo]]: 0, <ins>[[Bar]]: 1</ins> }.
        1. Set _x_ to a new Record { [[Foo]]: 0, <ins>[[Bar]]: 1, [[Baz]]: 2</ins> }.
        1. Set _x_ to a new Record { [[Foo]]: 0, <ins>[[Bar]]: 1,</ins> [[Baz]]: 2 }.
        1. Use _x_.
        </emu-alg>
      `);
    });
  });

  describe('errors', () => {
    it('open paren without close', async () => {
      await assertLint(
        positioned`
          <emu-alg>
            1. Let (.${M}
          </emu-alg>
        `,
        {
          ruleId: 'expression-parsing',
          nodeType: 'emu-alg',
          message: 'unexpected eof (expected close parenthesis)',
        },
      );
    });

    it('close paren without open', async () => {
      await assertLint(
        positioned`
          <emu-alg>
            1. Let ${M}).
          </emu-alg>
        `,
        {
          ruleId: 'expression-parsing',
          nodeType: 'emu-alg',
          message: 'unexpected close parenthesis without corresponding open parenthesis',
        },
      );
    });

    it('mismatched open/close tokens', async () => {
      await assertLint(
        positioned`
          <emu-alg>
            1. Let _foo_ and _a_ be variables.
            1. Let _x_ be «_foo_(_a_${M}»).
            1. Use _x_.
          </emu-alg>
        `,
        {
          ruleId: 'expression-parsing',
          nodeType: 'emu-alg',
          message: 'unexpected list close without corresponding list open',
        },
      );
    });

    it('elision in list', async () => {
      await assertLint(
        positioned`
          <emu-alg>
            1. Let _x_ be «${M},».
            1. Use _x_.
          </emu-alg>
        `,
        {
          ruleId: 'expression-parsing',
          nodeType: 'emu-alg',
          message: 'unexpected comma (expected some content for element/argument)',
        },
      );

      await assertLint(
        positioned`
          <emu-alg>
            1. Let _x_ be «_x_, ${M}».
          </emu-alg>
        `,
        {
          ruleId: 'expression-parsing',
          nodeType: 'emu-alg',
          message: 'unexpected list close (expected some content for element)',
        },
      );
    });

    it('elision in call', async () => {
      await assertLint(
        positioned`
          <emu-alg>
            1. Let _foo_ be a function.
            1. Let _x_ be _foo_(${M},)».
            1. Use _x_.
          </emu-alg>
        `,
        {
          ruleId: 'expression-parsing',
          nodeType: 'emu-alg',
          message: 'unexpected comma (expected some content for element/argument)',
        },
      );

      await assertLint(
        positioned`
          <emu-alg>
            1. Let _foo_ and _a_ be variables.
            1. Let _x_ be _foo_(_a_, ${M}).
            1. Use _x_.
          </emu-alg>
        `,
        {
          ruleId: 'expression-parsing',
          nodeType: 'emu-alg',
          message: 'unexpected close parenthesis (expected some content for argument)',
        },
      );
    });

    it('record without names', async () => {
      await assertLint(
        positioned`
          <emu-alg>
            1. Let _x_ be the Record { ${M}}.
            1. Use _x_.
          </emu-alg>
        `,
        {
          ruleId: 'expression-parsing',
          nodeType: 'emu-alg',
          message: 'records cannot be empty',
        },
      );
    });

    it('record with malformed names', async () => {
      await assertLint(
        positioned`
          <emu-alg>
            1. Let _x_ be the Record { ${M}[x]: 0 }.
            1. Use _x_.
          </emu-alg>
        `,
        {
          ruleId: 'expression-parsing',
          nodeType: 'emu-alg',
          message: 'expected to find record field name',
        },
      );
    });

    it('record with duplicate names', async () => {
      await assertLint(
        positioned`
          <emu-alg>
            1. Let _x_ be the Record { [[A]]: 0, [[${M}A]]: 0 }.
            1. Use _x_.
          </emu-alg>
        `,
        {
          ruleId: 'expression-parsing',
          nodeType: 'emu-alg',
          message: 'duplicate record field name A',
        },
      );
    });

    it('record where only some keys have values', async () => {
      await assertLint(
        positioned`
          <emu-alg>
            1. Let _x_ be the Record { [[A]], [[B]]${M}: 0 }.
            1. Use _x_.
          </emu-alg>
        `,
        {
          ruleId: 'expression-parsing',
          nodeType: 'emu-alg',
          message: 'record field has value but preceding field does not',
        },
      );

      await assertLint(
        positioned`
          <emu-alg>
            1. Let _x_ be the Record { [[A]]: 0, [[B]]${M} }.
            1. Use _x_.
          </emu-alg>
        `,
        {
          ruleId: 'expression-parsing',
          nodeType: 'emu-alg',
          message: 'expected record field to have value',
        },
      );
    });
  });

  describe('handling of <del>', () => {
    let biblio: ExportedBiblio;
    before(async () => {
      biblio = await getBiblio(`
        <emu-clause id="del-complex" type="abstract operation">
          <h1>
          Example (
              _x_: unknown,
              _y_: unknown,
            ): unknown
          </h1>
          <dl class="header"></dl>
        </emu-clause>
      `);
    });

    it('ignores contents of <del> tags', async () => {
      await assertLint(
        positioned`
          <emu-alg>
            1. Perform ${M}Example(x<del>, y</del>).
          </emu-alg>
        `,
        {
          ruleId: 'typecheck',
          nodeType: 'emu-alg',
          message: 'Example takes 2 arguments, but this invocation passes 1',
        },
        {
          extraBiblios: [biblio],
        },
      );

      await assertLintFree(
        `
          <emu-alg>
            1. Perform Example(x, y<del>, z</del>).
          </emu-alg>
        `,
        {
          extraBiblios: [biblio],
        },
      );

      await assertLintFree(
        `
          <emu-alg>
            1. <del>Perform Example(x, y, z).</del>
          </emu-alg>
        `,
        {
          extraBiblios: [biblio],
        },
      );
    });
  });

  describe('parse trees', () => {
    function parse(src: string, sdoNames: Set<string> = new Set()) {
      const tree = parseExpr(parseFragment(src), sdoNames);
      return JSON.parse(JSON.stringify(tree, (k, v) => (k === 'location' ? undefined : v)));
    }
    it('is able to handle `a.[[b]` nodes in SDO calls', async () => {
      const tree = parse('Perform SDO of _A_.[[B]] with argument _c_.[[D]].', new Set(['SDO']));
      assert.deepStrictEqual(tree, {
        name: 'seq',
        items: [
          { name: 'text', contents: 'Perform ' },
          {
            name: 'sdo-call',
            callee: [
              {
                name: 'text',
                contents: 'SDO',
              },
            ],
            parseNode: {
              items: [
                {
                  name: 'underscore',
                  contents: 'A',
                },
                {
                  name: 'text',
                  contents: '.',
                },
                {
                  name: 'double-brackets',
                  contents: 'B',
                },
              ],
              name: 'seq',
            },
            arguments: [
              {
                name: 'seq',
                items: [
                  {
                    name: 'underscore',
                    contents: 'c',
                  },
                  {
                    name: 'text',
                    contents: '.',
                  },
                  {
                    name: 'double-brackets',
                    contents: 'D',
                  },
                ],
              },
            ],
          },
          { name: 'text', contents: '.' },
        ],
      });
    });
  });
});
