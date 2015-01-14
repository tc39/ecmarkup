var Spec = require('./spec');
var utils = require('./utils');

exports.build = function(path, fetch) {
  return fetch(path)
    .then(utils.htmlToDoc)
    .then(function(doc) {
      var spec = new Spec(path, fetch, doc);
      return spec.build();
    });
}
