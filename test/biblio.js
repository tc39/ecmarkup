import assert from 'assert';
import { describe, it, beforeEach } from 'node:test';
import { JSDOM } from 'jsdom';
import BiblioModule from '../lib/Biblio.js';
import { build } from '../lib/ecmarkup.js';

const Biblio = BiblioModule.default;
const location = 'https://tc39.github.io/ecma262/';

describe('Biblio', () => {
  let biblio;

  beforeEach(() => {
    biblio = new Biblio(location);
  });

  it('is created with a root namespace named "external"', () => {
    const opEntry = {
      type: 'op',
      aoid: 'aoid',
      refId: 'clauseId',
    };

    biblio.add(opEntry, 'external');
    assert.equal(biblio.byAoid('aoid'), opEntry);
  });

  it("is created with a nested namespace for the doc's location", () => {
    const opEntry = {
      type: 'op',
      aoid: 'aoid',
      refId: 'clauseId',
    };

    biblio.add(opEntry, location);
    assert.equal(biblio.byAoid('aoid', 'external'), undefined);
    assert.equal(biblio.byAoid('aoid', location), opEntry);
  });

  it('localEntries includes only the local scope', () => {
    const opEntry1 = {
      type: 'op',
      aoid: 'aoid1',
      refId: 'clauseId',
    };

    const opEntry2 = {
      type: 'op',
      aoid: 'aoid2',
      refId: 'clauseId',
    };

    biblio.add(opEntry1, location);
    biblio.add(opEntry2, 'external');

    const str = JSON.stringify(biblio.localEntries());

    assert(str.indexOf('aoid1') > -1);
    assert(str.indexOf('aoid2') === -1);
  });

  it('getDefinedWords de-dupes by key', () => {
    const opEntry1 = {
      type: 'op',
      aoid: 'aoid',
      refId: 'clauseId',
    };

    const opEntry2 = {
      type: 'op',
      aoid: 'aoid',
      refId: 'clauseId',
    };

    biblio.add(opEntry1, location);
    biblio.add(opEntry2, 'external');

    let results = biblio.getDefinedWords(location);
    assert.equal(results.aoid, opEntry1);
  });

  it('can import an exported biblio', async () => {
    let spec1 = await build(
      'root.html',
      () => `
        <emu-clause id="c">
          <h1>Clause C</h1>
          <p>A definition of <dfn variants="examples">example</dfn>.</p>
        </emu-clause>
      `,
      {
        copyright: false,
        assets: 'none',
        location: 'https://example.com/spec/',
        warn: e => {
          console.error('Error:', e);
          throw new Error(e.message);
        },
      },
    );
    let spec1Biblio = spec1.exportBiblio();

    let spec2 = await build(
      'root.html',
      () => `
        <emu-clause id="d">
          <h1>Clause D</h1>
          <p>Terms like example or examples are crosslinked.</p>
        </emu-clause>
      `,
      {
        copyright: false,
        assets: 'none',
        toc: false,
        extraBiblios: [spec1Biblio],
        location: 'https://example.com/spec2/',
        warn: e => {
          console.error('Error:', e);
          throw new Error(e.message);
        },
      },
    );
    let renderedSpec2 = new JSDOM(spec2.toHTML()).window;
    assert.equal(
      renderedSpec2.document.querySelector('p').innerHTML,
      'Terms like <emu-xref href="#c"><a href="https://example.com/spec/#c">example</a></emu-xref> or <emu-xref href="#c"><a href="https://example.com/spec/#c">examples</a></emu-xref> are crosslinked.',
    );
  });

  it('propagates effects from exported biblios', async () => {
    let spec1 = await build(
      'root.html',
      () => `
        <emu-clause id="sec-user-code" type="abstract operation">
          <h1>UserCode ( )</h1>
          <dl class="header">
          </dl>
          <emu-alg>
            1. <emu-meta effects="user-code">Call user code</emu-meta>.
          </emu-alg>
        </emu-clause>
      `,
      {
        copyright: false,
        assets: 'none',
        location: 'https://example.com/spec/',
        warn: e => {
          console.error('Error:', e);
          throw new Error(e.message);
        },
      },
    );
    let spec1Biblio = spec1.exportBiblio();

    let spec2 = await build(
      'root.html',
      () => `
        <emu-clause id="foo" aoid="Foo">
          <h1>Clause D</h1>
          <emu-alg>
            1. UserCode().
          </emu-alg>
        </emu-clause>

        <emu-clause id="r">
          <h1>Clause R</h1>
          <emu-alg id="calls-foo">
            1. Foo().
          </emu-alg>
        </emu-clause>

        `,
      {
        copyright: false,
        assets: 'none',
        toc: false,
        extraBiblios: [spec1Biblio],
        markEffects: true,
        location: 'https://example.com/spec2/',
        warn: e => {
          console.error('Error:', e);
          throw new Error(e.message);
        },
      },
    );
    let renderedSpec2 = new JSDOM(spec2.toHTML()).window;
    assert.equal(
      renderedSpec2.document.querySelector('emu-alg').innerHTML,
      '<ol><li><emu-xref aoid="UserCode"><a href="https://example.com/spec/#sec-user-code" class="e-user-code">UserCode</a></emu-xref>().</li></ol>',
    );
    assert.equal(
      renderedSpec2.document.querySelector('#calls-foo').innerHTML,
      '<ol><li><emu-xref aoid="Foo" id="_ref_0"><a href="#foo" class="e-user-code">Foo</a></emu-xref>().</li></ol>',
    );
  });
});
