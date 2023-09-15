'use strict';

// Update superscripts to not suffer misinterpretation when copied and pasted as plain text.
// For example,
// * Replace `10<sup>3</sup>` with
//   `10<span aria-hidden="true">**</span><sup>3</sup>`
//   so it gets pasted as `10**3` rather than `103`.
// * Replace `10<sup>-<var>x</var></sup>` with
//   `10<span aria-hidden="true">**</span><sup>-<var>x</var></sup>`
//   so it gets pasted as `10**-x` rather than `10-x`.
// * Replace `2<sup><var>a</var> + 1</sup>` with
//   `2<span …>**(</span><sup><var>a</var> + 1</sup><span …>)</span>`
//   so it gets pasted as `2**(a + 1)` rather than `2a + 1`.

function makeExponentPlainTextSafe(sup) {
  // Change a <sup> only if it appears to be an exponent:
  // * text-only and contains only mathematical content (not e.g. `1<sup>st</sup>`)
  // * contains only <var>s and internal links (e.g.
  //   `2<sup><emu-xref><a href="#ℝ">ℝ</a></emu-xref>(_y_)</sup>`)
  const isText = [...sup.childNodes].every(node => node.nodeType === 3);
  const text = sup.textContent;
  if (isText) {
    if (!/^[0-9. 𝔽ℝℤ()=*×/÷±+\u2212-]+$/u.test(text)) {
      return;
    }
  } else {
    if (sup.querySelector('*:not(var, emu-xref, :scope emu-xref a)')) {
      return;
    }
  }

  let prefix = '**';
  let suffix = '';

  // Add wrapping parentheses unless they are already present
  // or this is a simple (possibly signed) integer or single-variable exponent.
  const skipParens =
    /^[±+\u2212-]?(?:[0-9]+|\p{ID_Start}\p{ID_Continue}*)$/u.test(text) ||
    // Split on parentheses and remember them; the resulting parts must
    // start and end empty (i.e., with open/close parentheses)
    // and increase depth to 1 only at the first parenthesis
    // to e.g. wrap `(a+1)*(b+1)` but not `((a+1)*(b+1))`.
    text
      .trim()
      .split(/([()])/g)
      .reduce((depth, s, i, parts) => {
        if (s === '(') {
          return depth > 0 || i === 1 ? depth + 1 : NaN;
        } else if (s === ')') {
          return depth > 0 ? depth - 1 : NaN;
        } else if (s === '' || (i > 0 && i < parts.length - 1)) {
          return depth;
        }
        return NaN;
      }, 0) === 0;
  if (!skipParens) {
    prefix += '(';
    suffix += ')';
  }

  sup.insertAdjacentHTML('beforebegin', `<span aria-hidden="true">${prefix}</span>`);
  if (suffix) {
    sup.insertAdjacentHTML('afterend', `<span aria-hidden="true">${suffix}</span>`);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('sup:not(.text)').forEach(sup => {
    makeExponentPlainTextSafe(sup);
  });
});
