'use strict';
const assert = require('assert');
const fs = require('fs');
const emu = require('../lib/ecmarkup');

describe('detecting duplicate ids', () => {
  it('warns for duplicate ids', async () => {
    let input = fs.readFileSync('test/duplicate-ids.html', 'utf8');

    let warnings = [];
    await emu.build('duplicate-ids.emu', async () => input, {
      ecma262Biblio: false,
      copyright: false,
      warn: str => warnings.push(str),
    });

    assert.deepStrictEqual(warnings, [
      '<emu-clause> has duplicate id: sec-a',
      '<emu-clause> has duplicate id: sec-a',
      '<emu-clause> has duplicate id: sec-a',
      '<emu-table> has duplicate id: table-of-stuff',
      '<emu-example> has duplicate id: an-example'
    ]);
  });
});
