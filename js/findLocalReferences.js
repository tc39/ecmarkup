var CLAUSE_NODES = ['EMU-CLAUSE', 'EMU-INTRO', 'EMU-ANNEX'];
function findLocalReferences ($elem) {
  var name = $elem.innerHTML;
  var references = [];

  var parentClause = $elem.parentNode;
  while (parentClause && CLAUSE_NODES.indexOf(parentClause.nodeName) === -1) {
    parentClause = parentClause.parentNode;
  }

  if(!parentClause) return;

  var vars = parentClause.querySelectorAll('var');

  for (var i = 0; i < vars.length; i++) {
    var $var = vars[i];

    if ($var.innerHTML === name) {
      references.push($var);
    }
  }

  return references;
}

function toggleFindLocalReferences($elem) {
  var references = findLocalReferences($elem);
  if ($elem.classList.contains('referenced')) {
    references.forEach(function ($reference) {
      $reference.classList.remove('referenced');
    });
  } else {
    references.forEach(function ($reference) {
      $reference.classList.add('referenced');
    });
  }
}

function installFindLocalReferences () {
  document.addEventListener('click', function (e) {
    if (e.target.nodeName === 'VAR') {
      toggleFindLocalReferences(e.target);
    }
  });
}

document.addEventListener('DOMContentLoaded', installFindLocalReferences);
