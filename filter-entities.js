'use strict';

// entities.json is from https://html.spec.whatwg.org/entities.json
// which is built by https://github.com/whatwg/html-build/tree/main/entities
// this processes it into a form more useful for us
// no new entities will be added, so the output of this file is committed
// rather than running it every time

let fs = require('fs');
let entities = require('./entities.json');

let transformed = Object.fromEntries(Object.entries(entities).map(([k, v]) => {
  // whitespace, default-ignorable, combining characters, control characters
  if (v.characters === '&' || v.characters === '<' || /\p{White_Space}|\p{DI}|\p{gc=M}|\p{gc=C}/u.test(v.characters)) {
    return [k, null];
  }
  return [k, v.characters];
}));
fs.writeFileSync('./entities-processed.json', JSON.stringify(transformed), 'utf8');
