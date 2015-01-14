var CLAUSE_ELEMS = ['EMU-INTRO', 'EMU-CLAUSE', 'EMU-ANNEX'];

exports.buildClauses = function(spec) {
  var clauses = spec.doc.querySelectorAll(CLAUSE_ELEMS.join(","));

  for(var i = 0; i < clauses.length; i++) {
    var clause = clauses[i];
    processEmd(clause);
    var parentClause = getParentClause(clause);
    var depth = initDepth(clause, parentClause);
    var num = numberClause(clause, depth);
    var header = buildHeader(doc, clause, num);
    var title = header.childNodes[1].textContent;

    toc.add(clause.getAttribute('id'), num, title, clause, parentClause);
  }

  return doc;
}

function textNodesUnder(node) {
  var nodes = [];

  for(node = node.firstChild; node; node = node.nextSibling) {
    if(node.nodeType == 3) {
      nodes.push(node);
    } else if(node.nodeName.indexOf("EMU-") !== 0 &&
      node.nodeName !== "PRE" &&
      node.nodeName !== "CODE") {
      nodes = nodes.concat(textNodesUnder(node));
    }
  }

  return nodes;
}
