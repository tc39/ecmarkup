import assert from 'assert';
import fs from 'fs';
import { describe, it } from 'node:test';
import vm from 'vm';
import { JSDOM, VirtualConsole } from 'jsdom';

import { build } from '../lib/ecmarkup.js';

const MENU_JS = new vm.Script(fs.readFileSync('js/menu.js', 'utf8'));

function stubMatchMedia(window: Window, { systemPrefersDark }: { systemPrefersDark: boolean }) {
  const listeners: (() => void)[] = [];
  const query = {
    matches: systemPrefersDark,
    addEventListener: (_: string, listener: () => void) => listeners.push(listener),
  };
  Object.assign(window, { matchMedia: () => query });
  return (dark: boolean) => {
    query.matches = dark;
    listeners.forEach(listener => listener());
  };
}

function mediaTexts(document: Document) {
  const collect = (rules: CSSRuleList): string[] =>
    [...rules].flatMap(rule =>
      'media' in rule
        ? [(rule as CSSMediaRule).media.mediaText]
        : 'cssRules' in rule
          ? collect((rule as CSSGroupingRule).cssRules)
          : [],
    );
  return [...document.styleSheets].flatMap(sheet => collect(sheet.cssRules));
}

// jsdom doesn't evaluate media queries, so these tests check how the queries are rewritten
function load(css: string, { systemPrefersDark }: { systemPrefersDark: boolean }) {
  const dom = new JSDOM(`<style>${css}</style>`, { runScripts: 'outside-only' });
  const window = dom.window as unknown as Window & { toggleColorScheme(): void };
  const changeSystemScheme = stubMatchMedia(window, { systemPrefersDark });
  MENU_JS.runInContext(dom.getInternalVMContext());
  return {
    toggle: () => window.toggleColorScheme(),
    changeSystemScheme,
    colorScheme: () => window.document.documentElement.style.colorScheme,
    mediaTexts: () => mediaTexts(window.document),
  };
}

const CSS = `
  @supports (color-scheme: dark) {
    @media only screen and (prefers-color-scheme: dark) { a { color: white } }
  }
  @media (prefers-color-scheme: light) and (min-width: 800px) { a { color: black } }
  @media not all and (prefers-color-scheme: dark) { a { color: gray } }
  @media print { a { color: blue } }
`;

const ORIGINAL = [
  'only screen and (prefers-color-scheme: dark)',
  '(prefers-color-scheme: light) and (min-width: 800px)',
  'not all and (prefers-color-scheme: dark)',
  'print',
];

const INVERTED = [
  'only screen and (prefers-color-scheme: light)',
  '(prefers-color-scheme: dark) and (min-width: 800px)',
  'not all and (prefers-color-scheme: light)',
  'print',
];

describe('color scheme toggle', () => {
  it('swaps light and dark in media queries, leaving other conditions alone', () => {
    const page = load(CSS, { systemPrefersDark: true });
    assert.deepStrictEqual(page.mediaTexts(), ORIGINAL);
    page.toggle();
    assert.deepStrictEqual(page.mediaTexts(), INVERTED);
    assert.equal(page.colorScheme(), 'light');
  });

  it('restores the original queries when toggled back', () => {
    const page = load(CSS, { systemPrefersDark: false });
    page.toggle();
    assert.equal(page.colorScheme(), 'dark');
    page.toggle();
    assert.deepStrictEqual(page.mediaTexts(), ORIGINAL);
    assert.equal(page.colorScheme(), '');
  });

  it('goes back to following the system when its scheme changes', () => {
    const page = load(CSS, { systemPrefersDark: false });
    page.toggle();
    page.changeSystemScheme(true);
    assert.deepStrictEqual(page.mediaTexts(), ORIGINAL);
    assert.equal(page.colorScheme(), '');
  });

  it('inverts every color scheme query in a generated spec when the button is clicked', async () => {
    const spec = await build(
      'root.html',
      async () =>
        '<pre class=metadata>title: t\ncopyright: false</pre><emu-clause id=sec><h1>hi</h1></emu-clause>',
      { assets: 'inline' },
    );
    const errors: string[] = [];
    const virtualConsole = new VirtualConsole();
    virtualConsole.on('jsdomError', error => {
      // jsdom's CSS parser doesn't support everything in our stylesheets; that's fine here
      if (!error.message.startsWith('Could not parse CSS stylesheet')) {
        errors.push(error.message);
      }
    });
    const dom = new JSDOM(spec.generatedFiles.get(null) as string, {
      runScripts: 'dangerously',
      virtualConsole,
      beforeParse: window =>
        stubMatchMedia(window as unknown as Window, { systemPrefersDark: false }),
    });
    const { document } = dom.window;
    await new Promise(resolve => dom.window.addEventListener('load', resolve));

    // the toggle can only rewrite queries in stylesheets, not in `media` attributes
    assert.deepStrictEqual(
      [...document.querySelectorAll('[media*=prefers-color-scheme]')].map(e => e.outerHTML),
      [],
    );
    const colorSchemeQueries = () =>
      mediaTexts(document).filter(text => text.includes('prefers-color-scheme'));
    const before = colorSchemeQueries();
    // ecmarkup's own dark theme, plus the highlight.js dark theme
    assert(before.length >= 2, `expected color scheme queries, got ${JSON.stringify(before)}`);

    document.getElementById('color-scheme-toggle')!.click();
    assert.deepStrictEqual(errors, []);
    assert.deepStrictEqual(
      colorSchemeQueries(),
      before.map(text => text.replace(/dark/, 'light')),
    );
  });
});
