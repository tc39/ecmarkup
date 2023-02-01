'use strict';

// Update superscripts to not suffer misinterpretation when copied and pasted as plain text.
// For example, `10<sup>3</sup>` becomes `103`, but `10³` is preserved.

const arithmeticReplacements = new Map([
  ['0', '⁰'],
  ['1', '¹'],
  ['2', '²'],
  ['3', '³'],
  ['4', '⁴'],
  ['5', '⁵'],
  ['6', '⁶'],
  ['7', '⁷'],
  ['8', '⁸'],
  ['9', '⁹'],
  ['(', '⁽'],
  [')', '⁾'],
  ['=', '⁼'],
  ['+', '⁺'],
  ['-', '⁻'],
  // Space is allowed as a special case.
  [' ', ' '],
]);

function makeSuperscriptAccessible(sup) {
  // Replace a text-only superscript with text when it is fully replaceable,
  // but otherwise do not modify it (for cases such as `1<sup>st</sup>`).
  if ([...sup.childNodes].every(node => node.nodeType === 3)) {
    const replacementText = sup.textContent
      .split('')
      .map(ch => arithmeticReplacements.get(ch) || '')
      .join('');
    if (replacementText.length === sup.textContent.length) {
      sup.replaceWith(replacementText);
    }
    return;
  }
  // Wrap a not-yet-handled superscript with hidden Knuth up-arrow notation
  // if it appears to represent exponentiation.
  if (!sup.classList.contains('text') && !sup.querySelector('*:not(var)')) {
    let prefix = ' ↑ ';
    let suffix = '';
    if (sup.childNodes.length > 1 && !/^\(.*\)$/s.test(sup.textContent.trim())) {
      prefix += '(';
      suffix += ')';
    }
    sup.insertAdjacentHTML('beforebegin', `<span aria-hidden="true">${prefix}</span>`);
    if (suffix) {
      sup.insertAdjacentHTML('afterend', `<span aria-hidden="true">${suffix}</span>`);
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('sup').forEach(sup => {
    makeSuperscriptAccessible(sup);
  });
});
