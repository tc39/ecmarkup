'use strict';


var sdoBox = {
  init: function () {
    this.$alternativeId = null;
    this.$outer = document.createElement('div');
    this.$outer.classList.add('toolbox-container');
    this.$container = document.createElement('div');
    this.$container.classList.add('toolbox');
    this.$displayLink = document.createElement('a');
    this.$displayLink.textContent = 'Syntax-Directed Operations'; // TODO number
    this.$displayLink.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      referencePane.showSDOs(sdoMap[this.$alternativeId] || [], this.$alternativeId);
    }.bind(this));
    this.$container.appendChild(this.$displayLink);
    this.$outer.appendChild(this.$container);
    document.body.appendChild(this.$outer);
  },

  activate: function (el) {
    clearTimeout(this.deactiveTimeout);
    Toolbox.deactivate();
    this.$alternativeId = el.getAttribute('a');
    var numSdos = (sdoMap[this.$alternativeId] || []).length;
    this.$displayLink.textContent = 'Syntax-Directed Operations (' + numSdos + ')';
    this.$outer.classList.add('active');
    var top = el.offsetTop - this.$outer.offsetHeight;
    var left = el.offsetLeft + 50 - 10; // 50px = padding-left(=75px) + text-indent(=-25px)
    this.$outer.setAttribute('style', 'left: ' + left + 'px; top: ' + top + 'px');
    if (top < document.body.scrollTop) {
      this.$container.scrollIntoView();
    }
  },

  deactivate: function () {
    clearTimeout(this.deactiveTimeout);
    this.$outer.classList.remove('active');
  },
};

document.addEventListener('DOMContentLoaded', function () {
  sdoBox.init();

  var insideTooltip = false;
  sdoBox.$outer.addEventListener('pointerenter', function () {
    insideTooltip = true;
  });
  sdoBox.$outer.addEventListener('pointerleave', function () {
    insideTooltip = false;
    sdoBox.deactivate();
  });

  sdoBox.deactiveTimeout = null;
  [].forEach.call(document.querySelectorAll('emu-grammar[type=definition] emu-rhs'), function (node) {
    node.addEventListener('pointerenter', function () {
      sdoBox.activate(this);
    });

    node.addEventListener('pointerleave', function (e) {
      sdoBox.deactiveTimeout = setTimeout(function() {
        if (!insideTooltip) {
          sdoBox.deactivate();
        }
      }, 500);
      // console.log('exit', this);
    });

  });

  document.addEventListener('keydown', debounce(function (e) {
    if (e.code === 'Escape') {
      sdoBox.deactivate();
    }
  }));
});

var sdoMap;
var sdoMapContainer = document.getElementById('sdo-map');
if (sdoMapContainer == null) {
  console.error('could not find SDO map container');
  sdoMap = {};
} else {
  sdoMap = JSON.parse(sdoMapContainer.textContent);
}

console.log(sdoMap)
