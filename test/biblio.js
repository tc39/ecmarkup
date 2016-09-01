'use strict';

const assert = require('assert');
const BiblioModule = require('../lib/Biblio');
const Biblio = BiblioModule.default;
const location = 'https://tc39.github.io/ecma262/';

describe('Biblio', function () {
  let biblio;

  beforeEach(function() {
    biblio = new Biblio(location);
  });

  specify('is created with a root namespace named "global"', function () {
    const opEntry = {
      type: 'op',
      aoid: 'aoid',
      refId: 'clauseId'
    };

    biblio.add(opEntry, 'global');
    assert.equal(biblio.byAoid('aoid'), opEntry);
  });

  specify('is created with a nested namespace for the doc\'s location', function () {
    const opEntry = {
      type: 'op',
      aoid: 'aoid',
      refId: 'clauseId'
    };

    biblio.add(opEntry, location);
    assert.equal(biblio.byAoid('aoid', 'global'), undefined);
    assert.equal(biblio.byAoid('aoid', location), opEntry);
  });

  specify('stringifies with only the local scope', function () {
    const opEntry1 = {
      type: 'op',
      aoid: 'aoid1',
      refId: 'clauseId'
    };

    const opEntry2 = {
      type: 'op',
      aoid: 'aoid2',
      refId: 'clauseId'
    };

    biblio.add(opEntry1, location);
    biblio.add(opEntry2, 'global');

    const str = JSON.stringify(biblio);

    assert(str.indexOf('aoid1') > -1);
    assert(str.indexOf('aoid2') === -1);
  });

  describe('inScopeByType', function () {
    specify('de-dupes by key', function () {
      const opEntry1 = {
        type: 'op',
        aoid: 'aoid',
        refId: 'clauseId'
      };

      const opEntry2 = {
        type: 'op',
        aoid: 'aoid',
        refId: 'clauseId'
      };

      biblio.add(opEntry1, location);
      biblio.add(opEntry2, 'global');

      let results = biblio.inScopeByType(location, 'op');
      assert.equal(results[0], opEntry1);
    });
  });
});
