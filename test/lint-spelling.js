'use strict';

let { assertLint, assertLintFree, positioned, lintLocationMarker: M } = require('./lint-helpers');

describe('spelling', function () {
  it('*this* object', async function () {
    await assertLint(
      positioned`
        <p>If the ${M}*this* object ...</p>
      `,
      {
        ruleId: 'spelling',
        nodeType: 'text',
        message: 'Prefer "*this* value"',
      }
    );
  });

  it("1's complement", async function () {
    await assertLint(
      positioned`
        <p>It returns the ${M}1's complement of _x_.</p>
      `,
      {
        ruleId: 'spelling',
        nodeType: 'text',
        message: 'Prefer "one\'s complement"',
      }
    );
  });

  it("2's complement", async function () {
    await assertLint(
      positioned`
        <p>BigInts act as ${M}2's complement binary strings</p>
      `,
      {
        ruleId: 'spelling',
        nodeType: 'text',
        message: 'Prefer "two\'s complement"',
      }
    );
  });

  it('*0*', async function () {
    await assertLint(
      positioned`
        <emu-alg>1. If _x_ is ${M}*0*, then foo.</emu-alg>
      `,
      {
        ruleId: 'spelling',
        nodeType: 'text',
        message: 'The Number value 0 should be written "*+0*", to unambiguously exclude "*-0*"',
      }
    );
  });

  it('behavior', async function () {
    await assertLint(
      positioned`
        <p>Most hosts will be able to simply define HostGetImportMetaProperties, and leave HostFinalizeImportMeta with its default ${M}behavior.</p>
      `,
      {
        ruleId: 'spelling',
        nodeType: 'text',
        message: 'ECMA-262 uses Oxford spelling ("behaviour")',
      }
    );
  });

  it('the empty string', async function () {
    await assertLint(
      positioned`
        <p>_searchValue_ is ${M}the empty string</p>
      `,
      {
        ruleId: 'spelling',
        nodeType: 'text',
        message: 'Prefer "the empty String"',
      }
    );
  });

  it('negative', async function () {
    await assertLintFree(`
      <p>
        the *this* value
        one's complement
        two's complement
        *+0*
        *-0*
        behaviour
        the empty String
      </p>
    `);
  });
});
