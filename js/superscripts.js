'use strict';

// Update superscripts to not suffer misinterpretation when copied and pasted as plain text.
// For example,
// * Replace `10<sup>3</sup>` with `10³` so it gets pasted as that rather than `103`.
// * Replace `10<sup>-<var>x</var></sup>` with
//   `10<span aria-hidden="true"> ↑ </span><sup>-<var>x</var></sup>`
//   so it gets pasted as `10 ↑ -x` rather than `10-x`.
// * Replace `2<sup><var>a</var> + 1</sup>` with
//   `2<span …> ↑ (</span><sup><var>a</var> + 1</sup><span …>)</span>`
//   so it gets pasted as `2 ↑ (a + 1)` rather than `2a + 1`.

const supReplacements = new Map([
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

function makeExponentPlainTextSafe(sup) {
  // Replace a text-only <sup> if its contents are fully representable,
  // but otherwise do not modify it (for cases such as `1<sup>st</sup>`).
  if ([...sup.childNodes].every(node => node.nodeType === 3)) {
    const text = sup.textContent;
    const replacementText = text
      .split('')
      .map(ch => supReplacements.get(ch) || '')
      .join('');
    if (replacementText.length === text.length) {
      sup.replaceWith(replacementText);
    }
    return;
  }

  // Add a hidden Knuth up-arrow before a <sup> that appears to represent an exponent.
  if (!sup.querySelector('*:not(var)')) {
    let prefix = ' ↑ ';
    let suffix = '';
    // Add wrapping parentheses unless they are already present or there are no medial spaces.
    if (!/^\(.*\)$|^\S*$/s.test(sup.textContent.trim())) {
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
  document.querySelectorAll('sup:not(.text)').forEach(sup => {
    makeExponentPlainTextSafe(sup);
  });
});
