module.exports = Production;
var RHS = require('./RHS');
var GrammarAnnotation = require('./GrammarAnnotation');
var NonTerminal = require('./NonTerminal');

function Production(spec, node) {
  this.spec = spec;
  this.node = node;
  this.type = node.getAttribute('type');
  this.name = node.getAttribute('name');
  this.params = node.getAttribute('params');
  this.optional = node.hasAttribute('optional');
  this.oneOf = node.hasAttribute('oneof');
  this.rhses = [];

  var rhses = this.node.querySelectorAll('emu-rhs');
  for(var i = 0; i < rhses.length; i++) {
    this.rhses.push(new RHS(this.spec, this, rhses[i]));
  }
}

Production.prototype.build = function() {
  var nt = this.spec.doc.createElement('emu-nt');
  var mods = this.createModifiersNode(this);
  nt.innerHTML = this.name;
  nt.appendChild(mods);
  this.node.insertBefore(nt, this.node.children[0])

  var geq = this.spec.doc.createElement('emu-geq');
  if(this.type === 'lexical') {
      geq.textContent = '::';
  } else if(this.type === 'numeric') {
      geq.textContent = ':::';
  } else {
      geq.textContent = ':';
  }

  this.node.insertBefore(geq, nt.nextSibling);

  if(this.oneOf) {
      var elem = this.spec.doc.createElement('emu-oneof');
      elem.textContent = 'one of'
      this.node.insertBefore(elem, geq.nextSibling)
  }

  this.rhses.forEach(function(rhs) {
    rhs.build();
  });

  var ganns = this.node.querySelectorAll('emu-gann');
  for(var i = 0; i < ganns.length; i++) {
    new GrammarAnnotation(this.spec, this, ganns[i]).build();
  }

  var nts = this.node.querySelectorAll('emu-nt');
  for(var i = 0; i < nts.length; i++) {
    new NonTerminal(this.spec, this, nts[i]).build();
  }
}

Production.prototype.createModifiersNode = function(entity) {
    var modifiers = '';

    if(entity.params) {
        modifiers += ' [' + entity.params + ']'
    }

    if(entity.optional) {
        modifiers += ' opt';
    }

    var el = this.spec.doc.createElement('emu-mods');
    el.textContent = modifiers;

    return el;
}

