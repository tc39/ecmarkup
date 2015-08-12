module.exports = Clause;
var CLAUSE_ELEMS = ['EMU-INTRO', 'EMU-CLAUSE', 'EMU-ANNEX'];
var Note = require('./Note');
var emd = require('ecmarkdown');
var utils = require('./utils');

function Clause(spec, node) {
  node._clause = this;

  this.header = node.querySelector('h1');
  if(!this.header) {
    throw new Error("Clause doesn't have header: " + node.outerHTML);
  }

  this.spec = spec;
  this.node = node;
  this.parentClause = getParentClause(node);
  this.title = this.header.textContent;
  this.subclauses = [];
  this.id = node.id;

  if(this.parentClause) {
    this.depth = this.parentClause.depth + 1;
    this.parentClause.subclauses.push(this);
  } else {
    this.depth = 0;
    this.spec.subclauses.push(this);
  }

  if(node.nodeName === 'EMU-INTRO') {
    this.number = '';
  } else {
    this.number = spec.getNextClauseNumber(this.depth,
      node.nodeName === 'EMU-ANNEX'
    );
  }

  this.aoid = node.getAttribute('aoid');
  if(this.aoid !== null) {
    if(this.aoid === "") this.aoid = this.id;

    this.spec.biblio.ops[this.aoid] = {
      aoid: this.aoid,
      id: this.id,
      location: '',
    }
  }

  this.spec.biblio.clauses[this.id] = {
    location: '',
    id: this.id,
    aoid: this.aoid,
    title: this.title,
    number: this.number
  }

  this.notes = this.getNotes();
}

Clause.prototype.build = function() {
  var numElem = this.spec.doc.createElement("span");
  numElem.setAttribute('class', 'secnum');
  numElem.textContent = this.number;
  this.header.insertBefore(numElem, this.header.firstChild);

  this.header.appendChild(this.buildUtils());
  processEmd(this);

  this.buildNotes();
};

Clause.prototype.buildNotes = function() {
  if(this.notes.length === 1) {
    this.notes[0].build();
  } else {
    // pass along note index
    this.notes.forEach(function(note, i) {
      note.build(i + 1);
    }, this)
  }
}

Clause.prototype.getNotes = function() {
  var notes = [];

  utils.domWalk(this.node, function(child) {
    if(CLAUSE_ELEMS.indexOf(child.nodeName) > -1) {
      return false;
    }

    if(child.nodeName === 'EMU-NOTE') {
      notes.push(new Note(this.spec, child));
    }
  }.bind(this));

  return notes;
}

Clause.prototype.buildUtils = function() {
  var utilsElem = this.spec.doc.createElement('span');
  utilsElem.setAttribute('class', 'utils');

  var anchorElem = this.spec.doc.createElement('span');
  anchorElem.setAttribute('class', 'anchor');
  anchorElem.innerHTML = '<a href="#' + this.id + '">#</a>';

  utilsElem.appendChild(anchorElem);

  return utilsElem;
}

function getParentClause(node) {
  var current = node.parentNode;
  while(current) {
    if(CLAUSE_ELEMS.indexOf(current.nodeName) > -1) return current._clause;
    current = current.parentNode;
  }

  return null;
}

function processEmd(clause) {
  var doc = clause.spec.doc;
  var textNodes = textNodesUnder(clause.node);
  for(var j = 0; j < textNodes.length; j++) {
    var node = textNodes[j];
    if(node.textContent.trim().length === 0) continue;

    // emd strips starting and ending spaces which we want to preserve
    var startSpace = node.textContent.match(/^\s*/)[0];
    var endSpace = node.textContent.match(/\s*$/)[0];

    var template = doc.createElement('template');
    template.innerHTML = startSpace + emd.fragment(node.textContent) + endSpace;

    // Append all the nodes
    var parent = node.parentNode;
    while(template.childNodes.length > 0) {
      node.parentNode.insertBefore(template.childNodes[0], node);
    }

    node.parentNode.removeChild(node);
  }

}

var NO_EMD = ['PRE', 'CODE', 'EMU-CLAUSE', 'EMU-PRODUCTION', 'EMU-ALG', 'EMU-GRAMMAR'];
function textNodesUnder(node) {
  var all = [];

  for (node=node.firstChild; node; node=node.nextSibling) {
    if (node.nodeType==3) all.push(node);
    else if(NO_EMD.indexOf(node.nodeName) === -1) all = all.concat(textNodesUnder(node));
  }

  return all;
}
