'use strict';

document.documentElement.addEventListener('click', function (e) {
  var idReferences = findRelevantReferences(e.target);
  if (idReferences) {
    toggleAttr(idReferences, 'hidden');
  }
});

function toggleAttr(el, attr) {
  if (el.hasAttribute(attr)) {
    el.removeAttribute(attr);
  } else {
    el.setAttribute(attr, '');
  }
}

function findRelevantReferences(el) {
  if (el.className === 'anchor' && el.parentElement && el.parentElement.className === 'utils') {
    return el.parentElement.querySelector('.id-references');
  }

  return null;
}
