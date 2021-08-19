'use strict';

const assert = require('assert');
const BiblioModule = require('../lib/Biblio');
const Biblio = BiblioModule.default;
const location = 'https://tc39.github.io/ecma262/';

describe('Biblio', () => {
  let biblio;

  beforeEach(() => {
    biblio = new Biblio(location);
  });

  specify('is created with a root namespace named "global"', () => {
    const opEntry = {
      type: 'op',
      aoid: 'aoid',
      refId: 'clauseId',
    };

    biblio.add(opEntry, 'global');
    assert.equal(biblio.byAoid('aoid'), opEntry);
  });

  specify("is created with a nested namespace for the doc's location", () => {
    const opEntry = {
      type: 'op',
      aoid: 'aoid',
      refId: 'clauseId',
    };

    biblio.add(opEntry, location);
    assert.equal(biblio.byAoid('aoid', 'global'), undefined);
    assert.equal(biblio.byAoid('aoid', location), opEntry);
  });

  specify('stringifies with only the local scope', () => {
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
    biblio.add(opEntry2, 'global');

    const str = JSON.stringify(biblio);

    assert(str.indexOf('aoid1') > -1);
    assert(str.indexOf('aoid2') === -1);
  });

  describe('getDefinedWords', () => {
    specify('de-dupes by key', () => {
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
      biblio.add(opEntry2, 'global');

      let results = biblio.getDefinedWords(location);
      assert.equal(results.aoid, opEntry1);
    });
  });
});
