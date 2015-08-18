'use strict';

const Spec = require('./Spec');
const utils = require('./utils');

exports.build = function (path, fetch, opts) {
  return fetch(path)
    .then(utils.htmlToDoc)
    .then(function (doc) {
      return new Spec(path, fetch, doc, opts).build();
    });
};
