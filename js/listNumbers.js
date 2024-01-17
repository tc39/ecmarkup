'use strict';

// Manually prefix algorithm step list items with hidden counter representations
// corresponding with their markers so they get selected and copied with content.
// We read list-style-type to avoid divergence with the style sheet, but
// for efficiency assume that all lists at the same nesting depth use the same
// style (except for those associated with replacement steps).
// We also precompute some initial items for each supported style type.
// https://w3c.github.io/csswg-drafts/css-counter-styles/

const lowerLetters = Array.from({ length: 26 }, (_, i) =>
  String.fromCharCode('a'.charCodeAt(0) + i),
);
// Implement the lower-alpha 'alphabetic' algorithm,
// adjusting for indexing from 0 rather than 1.
// https://w3c.github.io/csswg-drafts/css-counter-styles/#simple-alphabetic
// https://w3c.github.io/csswg-drafts/css-counter-styles/#alphabetic-system
const lowerAlphaTextForIndex = i => {
  let S = '';
  for (const N = lowerLetters.length; i >= 0; i--) {
    S = lowerLetters[i % N] + S;
    i = Math.floor(i / N);
  }
  return S;
};

const weightedLowerRomanSymbols = Object.entries({
  m: 1000,
  cm: 900,
  d: 500,
  cd: 400,
  c: 100,
  xc: 90,
  l: 50,
  xl: 40,
  x: 10,
  ix: 9,
  v: 5,
  iv: 4,
  i: 1,
});
// Implement the lower-roman 'additive' algorithm,
// adjusting for indexing from 0 rather than 1.
// https://w3c.github.io/csswg-drafts/css-counter-styles/#simple-numeric
// https://w3c.github.io/csswg-drafts/css-counter-styles/#additive-system
const lowerRomanTextForIndex = i => {
  let value = i + 1;
  let S = '';
  for (const [symbol, weight] of weightedLowerRomanSymbols) {
    if (!value) break;
    if (weight > value) continue;
    const reps = Math.floor(value / weight);
    S += symbol.repeat(reps);
    value -= weight * reps;
  }
  return S;
};

// Memoize pure index-to-text functions with an exposed cache for fast retrieval.
const makeCounter = (pureGetTextForIndex, precomputeCount = 30) => {
  const cache = Array.from({ length: precomputeCount }, (_, i) => pureGetTextForIndex(i));
  const getTextForIndex = i => {
    if (i >= cache.length) cache[i] = pureGetTextForIndex(i);
    return cache[i];
  };
  return { getTextForIndex, cache };
};

const counterByStyle = {
  __proto__: null,
  decimal: makeCounter(i => String(i + 1)),
  'lower-alpha': makeCounter(lowerAlphaTextForIndex),
  'upper-alpha': makeCounter(i => lowerAlphaTextForIndex(i).toUpperCase()),
  'lower-roman': makeCounter(lowerRomanTextForIndex),
  'upper-roman': makeCounter(i => lowerRomanTextForIndex(i).toUpperCase()),
};
const fallbackCounter = makeCounter(() => '?');
const counterByDepth = [];

function addStepNumberText(
  ol,
  depth = 0,
  special = [...ol.classList].some(c => c.startsWith('nested-')),
) {
  let counter = !special && counterByDepth[depth];
  if (!counter) {
    const counterStyle = getComputedStyle(ol)['list-style-type'];
    counter = counterByStyle[counterStyle];
    if (!counter) {
      console.warn('unsupported list-style-type', {
        ol,
        counterStyle,
        id: ol.closest('[id]')?.getAttribute('id'),
      });
      counterByStyle[counterStyle] = fallbackCounter;
      counter = fallbackCounter;
    }
    if (!special) {
      counterByDepth[depth] = counter;
    }
  }
  const { cache, getTextForIndex } = counter;
  let i = (Number(ol.getAttribute('start')) || 1) - 1;
  for (const li of ol.children) {
    const marker = document.createElement('span');
    marker.textContent = `${i < cache.length ? cache[i] : getTextForIndex(i)}. `;
    marker.setAttribute('aria-hidden', 'true');
    const attributesContainer = li.querySelector('.attributes-tag');
    if (attributesContainer == null) {
      li.prepend(marker);
    } else {
      attributesContainer.insertAdjacentElement('afterend', marker);
    }
    for (const sublist of li.querySelectorAll(':scope > ol')) {
      addStepNumberText(sublist, depth + 1, special);
    }
    i++;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('emu-alg > ol').forEach(ol => {
    addStepNumberText(ol);
  });
});
