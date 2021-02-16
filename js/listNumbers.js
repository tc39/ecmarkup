var decimalBullet = Array.apply(null, Array(100)).map(function (a, i) {
  return '' + (i + 1);
});
var alphaBullet = Array.apply(null, Array(26)).map(function (a, i) {
  return String.fromCharCode('a'.charCodeAt(0) + i);
});

// prettier-ignore
var romanBullet = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x', 'xi', 'xii', 'xiii', 'xiv', 'xv', 'xvi', 'xvii', 'xviii', 'xix', 'xx', 'xxi', 'xxii', 'xxiii', 'xxiv', 'xxv'];
// prettier-ignore
var bullets = [decimalBullet, alphaBullet, romanBullet, decimalBullet, alphaBullet, romanBullet];

function addStepNumberText(ol, parentIndex) {
  for (var i = 0; i < ol.children.length; ++i) {
    var child = ol.children[i];
    var index = parentIndex.concat([i]);
    var applicable = bullets[Math.min(index.length - 1, 5)];
    var span = document.createElement('span');
    span.textContent = (applicable[i] || '?') + '. ';
    span.style.fontSize = '0';
    span.setAttribute('aria-hidden', 'true');
    child.prepend(span);
    var sublist = child.querySelector('ol');
    if (sublist != null) {
      addStepNumberText(sublist, index);
    }
  }
}
document.addEventListener('DOMContentLoaded', function () {
  document.querySelectorAll('emu-alg > ol').forEach(function (ol) {
    addStepNumberText(ol, []);
  });
});
