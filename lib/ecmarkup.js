var Spec = require('./Spec');
var utils = require('./utils');

exports.build = function(path, fetch) {
  return fetch(path)
    .then(utils.htmlToDoc)
    .then(function (doc) {
      return new Spec(path, fetch, doc).build();
    });
};
