import assert from 'assert';
import { describe, it } from 'node:test';
// the more common `dedent` has bug: https://github.com/dmnd/dedent/issues/24
import dedent from 'dedent-js';

import { printDocument } from '../lib/formatter/ecmarkup.js';

describe('document formatting', () => {
  it('indentation', async () => {
    await assertDocFormatsAs(
      `
      <some-tag>
      <!-- comment -->
      <some-tag>
            text
            <some-tag>
        </some-tag>
      <some-tag>
      </some-tag>
        </some-tag>
      </some-tag>

      <div><h1>this is all on one lines</h1>some text<p>more <em>text</em></p></div>
      `,
      dedentKeepingTrailingNewline`
      <some-tag>
        <!-- comment -->
        <some-tag>
          text
          <some-tag>
          </some-tag>
          <some-tag>
          </some-tag>
        </some-tag>
      </some-tag>

      <div>
        <h1>this is all on one lines</h1>
        some text
        <p>more <em>text</em></p>
      </div>
      `,
    );
  });

  it('text', async () => {
    await assertDocFormatsAs(
      `
      <b>this   is some text </b>and some more text\x20\x20
      `,
      dedentKeepingTrailingNewline`
      <b>this is some text</b> and some more text
      `,
    );
  });

  it('comments', async () => {
    await assertDocFormatsAs(
      `
      <!-- inline comments remain inline -->
      <div>
      <!--
              multiline comments
                  remain multiline
                and preserve whatever internal indentation you had
                but still account for indentation level
      -->
      </div>
      `,
      dedentKeepingTrailingNewline`
      <!-- inline comments remain inline -->
      <div>
        <!--
          multiline comments
              remain multiline
            and preserve whatever internal indentation you had
            but still account for indentation level
        -->
      </div>
      `,
    );
  });

  it('multibyte characters', async () => {
    await assertRoundTrips(`<p>😀 this is a test for a workaround for a parse5 bug</p>\n`);
  });

  it('blank lines', async () => {
    await assertDocFormatsAs(
      `
      <emu-clause>
        <h1>Title</h1>
      </emu-clause>
      <emu-clause>
        <h1>Blank line is inserted before clauses</h1>
      </emu-clause>

      single blank lines are allowed


      multiple blank lines are collapsed

      <emu-clause>

        blank lines are dropped at the start of elements

        but not in the middle

        but again at the end

      </emu-clause>
      `,
      dedentKeepingTrailingNewline`
      <emu-clause>
        <h1>Title</h1>
      </emu-clause>

      <emu-clause>
        <h1>Blank line is inserted before clauses</h1>
      </emu-clause>

      single blank lines are allowed

      multiple blank lines are collapsed

      <emu-clause>
        blank lines are dropped at the start of elements

        but not in the middle

        but again at the end
      </emu-clause>
      `,
    );
  });

  it('tags', async () => {
    await assertDocFormatsAs(
      `
      <A HREF=SOMETHING  attr='other' empty="">tags get normalized</A >
      `,
      dedentKeepingTrailingNewline`
      <a href="SOMETHING" attr="other" empty>tags get normalized</a>
      `,
    );
  });

  it('<body> is dropped if it has no attributes', async () => {
    await assertDocFormatsAs(
      `
      <body>
        <emu-clause>
          <h1>stuff</h1>
        </emu-clause>
      </body>
      `,
      dedentKeepingTrailingNewline`
      <emu-clause>
        <h1>stuff</h1>
      </emu-clause>
  `,
    );
  });

  it('<body> is kept if it has attributes', async () => {
    await assertDocFormatsAs(
      `
      <body class="clz">
        <emu-clause>
          <h1>stuff</h1>
        </emu-clause>
      </body>
      `,
      dedentKeepingTrailingNewline`
      <head>
      </head>
      <body class="clz">

        <emu-clause>
          <h1>stuff</h1>
        </emu-clause>
      </body>
  `,
    );
  });

  it('<br>', async () => {
    await assertDocFormatsAs(
      `
      br goes at the end of a line, like this:<br>
      not like this: <br>
      or like this:
      <br>
      and certainly
      <br> not like this
      `,
      dedentKeepingTrailingNewline`
      br goes at the end of a line, like this:<br>
      not like this:<br>
      or like this:<br>
      and certainly<br>
      not like this
      `,
    );
  });

  it('<tbody> is dropped iff possible', async () => {
    await assertDocFormatsAs(
      `
      <!-- dropped here -->
      <table>
        <tbody>
          <tr><td>cell</td></tr>
        </tbody>
      </table>

      <!-- dropped here -->
      <table>
        <thead>
          <tr><td>cell</td></tr>
        </thead>
        <tbody>
          <tr><td>cell</td></tr>
        </tbody>
      </table>

      <!-- kept here -->
      <table>
        <thead>
          <tr><td>cell</td></tr>
        </thead>
        <tbody class="oh no">
          <tr><td>cell</td></tr>
        </tbody>
      </table>
      `,
      dedentKeepingTrailingNewline`
      <!-- dropped here -->
      <table>
        <tr><td>cell</td></tr>
      </table>

      <!-- dropped here -->
      <table>
        <thead>
          <tr><td>cell</td></tr>
        </thead>
        <tr><td>cell</td></tr>
      </table>

      <!-- kept here -->
      <table>
        <thead>
          <tr><td>cell</td></tr>
        </thead>
        <tbody class="oh no">
          <tr><td>cell</td></tr>
        </tbody>
      </table>
      `,
    );
  });

  it('<script>, <style>, and <pre> whitespace is preserved', async () => {
    await assertRoundTrips(
      `<script>
    content
</script>
<style>
    content
</style>
<pre>
    content
</pre>
`,
    );
  });

  it('<p> is inline unless multi-line', async () => {
    await assertDocFormatsAs(
      `
      <p>
        sometimes people write like this
      </p>
      <em><p>and they might theoretically write like this</p></em>
      <p>sometimes they put explicit linebreaks:<br>inside of the paragraph</p>
      `,
      dedentKeepingTrailingNewline`
      <p>sometimes people write like this</p>
      <em>
        <p>and they might theoretically write like this</p>
      </em>
      <p>
        sometimes they put explicit linebreaks:<br>
        inside of the paragraph
      </p>
      `,
    );
  });

  it('normalizes `_opt` in nonterminals to `?`', async () => {
    await assertDocFormatsAs(
      `
      <p>Here is a nonterminal written two ways: |Foo?| and |Foo_opt|.</p>
      `,
      dedentKeepingTrailingNewline`
      <p>Here is a nonterminal written two ways: |Foo?| and |Foo?|.</p>
      `,
    );
  });

  it('supports `emu-format ignore` comments', async () => {
    await assertDocFormatsAs(
      `
<P> this   gets   formatted </P>
<!-- emu-format ignore -->
<P> this   does   not </P>
<P> this   also   gets   formatted </P>
      `,
      `<p>this gets formatted</p>
<!-- emu-format ignore -->
<P> this   does   not </P>
<p>this also gets formatted</p>
`,
    );
  });
});

describe('grammar formatting', () => {
  it('whitespace', async () => {
    await assertDocFormatsAs(
      `
      <emu-grammar>
        X [ flag ]   :  Y ?
        Z:W     #prod1
      </emu-grammar>
      <emu-grammar>
      A :
            B
            C#prod2
            &lt;ASCII&gt;
            U+2000
      </emu-grammar>
      `,
      dedentKeepingTrailingNewline`
      <emu-grammar>
        X[flag] : Y?

        Z : W #prod1
      </emu-grammar>
      <emu-grammar>
        A :
          B
          C #prod2
          &lt;ASCII&gt;
          U+2000
      </emu-grammar>
      `,
    );
  });

  it('collapses identical LHSes', async () => {
    await assertDocFormatsAs(
      `
      <emu-grammar>
        // comment 1
        X : Y
        // comment 2
        X :
          Z
          W
      </emu-grammar>
      `,
      dedentKeepingTrailingNewline`
      <emu-grammar>
        // comment 1
        // comment 2
        X :
          Y
          Z
          W
      </emu-grammar>
        `,
    );
  });

  it('ensures all productions are multiline if any are', async () => {
    await assertDocFormatsAs(
      `
        <emu-grammar>
          A : B
          C :
            D
            E
        </emu-grammar>
        `,
      dedentKeepingTrailingNewline`
        <emu-grammar>
          A :
            B

          C :
            D
            E
        </emu-grammar>
          `,
    );
  });

  it('allows you to write a grammar inline', async () => {
    await assertDocFormatsAs(
      `
      <p>Some fact about the production <emu-grammar>X   :   Y</emu-grammar>.</p>
      `,
      dedentKeepingTrailingNewline`
      <p>Some fact about the production <emu-grammar>X : Y</emu-grammar>.</p>
      `,
    );
  });

  it('supports `emu-format ignore` comments', async () => {
    await assertDocFormatsAs(
      `
<emu-grammar>
  A1  :  B1
  // emu-format ignore
  A2  :  B2
  A3  :  B3
</emu-grammar>
`,
      `<emu-grammar>
  A1 : B1

  // emu-format ignore
  A2  :  B2

  A3 : B3
</emu-grammar>
`,
    );
  });

  it('consistency for various punctuators', async () => {
    await assertDocFormatsAs(
      `
      <emu-grammar>
        A :
          B [lookahead ∈ { \`x\` }]
          B [lookahead &lt;- { \`x\` }]
          B [lookahead &isin; { \`x\` }]
          B [lookahead ∉ { \`x\` }]
          B [lookahead &lt;! { \`x\` }]
          B [lookahead &notin; { \`x\` }]
      </emu-grammar>
      `,
      dedentKeepingTrailingNewline`
      <emu-grammar>
        A :
          B [lookahead &isin; { \`x\` }]
          B [lookahead &isin; { \`x\` }]
          B [lookahead &isin; { \`x\` }]
          B [lookahead &notin; { \`x\` }]
          B [lookahead &notin; { \`x\` }]
          B [lookahead &notin; { \`x\` }]
      </emu-grammar>
      `,
    );
  });
});

describe('algorithm formatting', () => {
  it('whitespace', async () => {
    await assertDocFormatsAs(
      `
      <emu-alg>
      1.  Step.
      1. Another   step.
            1. A substep.
            1. [ x =  "a",y="b" ,c="",d ] A step with attributes.
            1. A step with _vars_, numbers like **10<sup>x</sup>**, records like {  [[A]]: 0  }, and fields like _o_.[[field]].
      </emu-alg>
      `,
      dedentKeepingTrailingNewline`
      <emu-alg>
        1. Step.
        1. Another step.
          1. A substep.
          1. [x="a", y="b", c, d] A step with attributes.
          1. A step with _vars_, numbers like **10<sup>x</sup>**, records like { [[A]]: 0 }, and fields like _o_.[[field]].
      </emu-alg>
      `,
    );
  });

  it('multiline steps', async () => {
    await assertDocFormatsAs(
      `
      <emu-alg>
      1. Return the Record {
                [[Precision]]: *"minute"*,
                [[Unit]]: *"minute"*,
                [[Increment]]: 1
              }.
      </emu-alg>
      `,
      dedentKeepingTrailingNewline`
      <emu-alg>
        1. Return the Record {
            [[Precision]]: *"minute"*,
            [[Unit]]: *"minute"*,
            [[Increment]]: 1
          }.
      </emu-alg>
      `,
    );
  });

  it('nested html', async () => {
    await assertDocFormatsAs(
      `
      <emu-alg>
        1. Nodes can have nested HTML, which gets formatted as usual.
              <table><tbody><tr><td>like this!</tr></tbody></table>
      </emu-alg>
      `,
      dedentKeepingTrailingNewline`
      <emu-alg>
        1. Nodes can have nested HTML, which gets formatted as usual.
          <table>
            <tr><td>like this!</td></tr>
          </table>
      </emu-alg>
      `,
    );
  });

  it('supports `emu-format ignore` comments', async () => {
    await assertRoundTrips(
      `<emu-alg>
  1. \`emu-format ignore\` comments are respected when printing html.
    <!-- emu-format ignore -->
    <table><tbody><tr><td>like this!</tr></tbody></table>
</emu-alg>
`,
    );
  });

  it('handles various format characters properly', async () => {
    await assertDocFormatsAs(
      `
      <p>__proto__,  \`\\u{50}\`,  \`**\`</p>
      `,
      dedentKeepingTrailingNewline`
      <p>__proto__, \`\\u{50}\`, \`**\`</p>
      `,
    );
  });
});

describe('equation formatting', () => {
  it('single-line equations remain inline', async () => {
    await assertDocFormatsAs(
      `
      <emu-eqn> abs(x) =   x if x > 0 else -x </emu-eqn>
      `,
      dedentKeepingTrailingNewline`
      <emu-eqn>abs(x) = x if x > 0 else -x</emu-eqn>
      `,
    );
  });

  it('multi-line equations are formatted appropriately', async () => {
    await assertDocFormatsAs(
      `
      <emu-eqn id="eqn-DaysInYear" aoid="DaysInYear">
      DaysInYear(_y_)
      = *365*<sub>𝔽</sub> if (ℝ(_y_) modulo 4) ≠ 0
        = *366*<sub>𝔽</sub> if (ℝ(_y_) modulo 4) = 0 and (ℝ(_y_) modulo 100) ≠ 0
    = *365*<sub>𝔽</sub> if (ℝ(_y_) modulo 100) = 0 and (ℝ(_y_) modulo 400) ≠ 0
      = *366*<sub>𝔽</sub> if (ℝ(_y_) modulo 400) = 0
      </emu-eqn>

      <emu-eqn id="eqn-DaysInYear" aoid="DaysInYear">DaysInYear(_y_)
      = *365*<sub>𝔽</sub> if (ℝ(_y_) modulo 4) ≠ 0
      = *366*<sub>𝔽</sub> if (ℝ(_y_) modulo 4) = 0 and (ℝ(_y_) modulo 100) ≠ 0
      = *365*<sub>𝔽</sub> if (ℝ(_y_) modulo 100) = 0 and (ℝ(_y_) modulo 400) ≠ 0
      = *366*<sub>𝔽</sub> if (ℝ(_y_) modulo 400) = 0 </emu-eqn>
      `,
      dedentKeepingTrailingNewline`
      <emu-eqn id="eqn-DaysInYear" aoid="DaysInYear">
        DaysInYear(_y_)
          = *365*<sub>𝔽</sub> if (ℝ(_y_) modulo 4) ≠ 0
          = *366*<sub>𝔽</sub> if (ℝ(_y_) modulo 4) = 0 and (ℝ(_y_) modulo 100) ≠ 0
          = *365*<sub>𝔽</sub> if (ℝ(_y_) modulo 100) = 0 and (ℝ(_y_) modulo 400) ≠ 0
          = *366*<sub>𝔽</sub> if (ℝ(_y_) modulo 400) = 0
      </emu-eqn>

      <emu-eqn id="eqn-DaysInYear" aoid="DaysInYear">
        DaysInYear(_y_)
          = *365*<sub>𝔽</sub> if (ℝ(_y_) modulo 4) ≠ 0
          = *366*<sub>𝔽</sub> if (ℝ(_y_) modulo 4) = 0 and (ℝ(_y_) modulo 100) ≠ 0
          = *365*<sub>𝔽</sub> if (ℝ(_y_) modulo 100) = 0 and (ℝ(_y_) modulo 400) ≠ 0
          = *366*<sub>𝔽</sub> if (ℝ(_y_) modulo 400) = 0
      </emu-eqn>
      `,
    );
  });
});

describe('structured header formatting', () => {
  it('multiline with no arguments', async () => {
    await assertDocFormatsAs(
      `
      <emu-clause>
        <h1>
          Foo (
          ): ~empty~
        </h1>

        <dl class="header">
        </dl>
      </emu-clause>
      `,
      dedentKeepingTrailingNewline`
      <emu-clause>
        <h1>Foo ( ): ~empty~</h1>

        <dl class="header">
        </dl>
      </emu-clause>
      `,
    );
  });

  it('whitespace in inline style', async () => {
    await assertDocFormatsAs(
      `
      <emu-clause>
        <h1>Foo(_bar_  [,_baz_  ])</h1>

        <dl class="header">
        </dl>
      </emu-clause>
      `,
      dedentKeepingTrailingNewline`
      <emu-clause>
        <h1>Foo ( _bar_ [ , _baz_ ] )</h1>

        <dl class="header">
        </dl>
      </emu-clause>
      `,
    );
  });

  it('whitespace in multiline style', async () => {
    await assertDocFormatsAs(
      `
      <emu-clause>
        <h1>Foo(
              _bar_: whatever,
         optional   _baz_  : whatever
            ):some return type</h1>

        <dl class="header">
        </dl>
      </emu-clause>
      `,
      dedentKeepingTrailingNewline`
      <emu-clause>
        <h1>
          Foo (
            _bar_: whatever,
            optional _baz_: whatever,
          ): some return type
        </h1>

        <dl class="header">
        </dl>
      </emu-clause>
      `,
    );
  });

  it('adds missing underscores to parameter names', async () => {
    await assertDocFormatsAs(
      `
      <emu-clause>
        <h1>Foo ( bar [ , baz ] )</h1>

        <dl class="header">
        </dl>
      </emu-clause>
      `,
      dedentKeepingTrailingNewline`
      <emu-clause>
        <h1>Foo ( _bar_ [ , _baz_ ] )</h1>

        <dl class="header">
        </dl>
      </emu-clause>
      `,
    );
  });
});

describe('entities', () => {
  it('entities are transformed or not as appropriate', async () => {
    await assertDocFormatsAs(
      `
      <div>
        some named entities are transformed: &AMP; &AMP &LT &frac12; &frac12 &fjlig; &CapitalDifferentialD;
        others are preserved: &amp; &lt; &nbsp; &nbsp &NotAnEntity;
        numeric entities are transformed too: &#x26; &#38; &#x3C; &#60; &#X1d306;
        unless they're whitespace etc: &#xA0;
      </div>
      <emu-alg>
        1. This also works in algorithms, as in &laquo; 0, 1 &raquo;.
      </emu-alg>
      `,
      dedentKeepingTrailingNewline`
      <div>
        some named entities are transformed: &amp; &amp; &lt; ½ ½ fj ⅅ
        others are preserved: &amp; &lt; &nbsp; &nbsp &NotAnEntity;
        numeric entities are transformed too: &amp; &amp; &lt; &lt; 𝌆
        unless they're whitespace etc: &#xA0;
      </div>
      <emu-alg>
        1. This also works in algorithms, as in « 0, 1 ».
      </emu-alg>
      `,
    );
  });
});

async function assertRoundTrips(src) {
  await assertDocFormatsAs(src, src);
}

async function assertDocFormatsAs(src, result) {
  const withDoctype = await printDocument(src);
  assert.strictEqual(withDoctype.replace(/^<!DOCTYPE html>\n+/, ''), result);

  const doubleFormatted = await printDocument(result);
  assert.strictEqual(doubleFormatted, withDoctype, 'result changed after formatting again');
}

function dedentKeepingTrailingNewline(strings, ...exprs) {
  let lastIsWhitespace = strings[strings.length - 1].match(/\n\s*$/);
  let dedented = dedent(strings, ...exprs);
  if (lastIsWhitespace) {
    dedented += '\n';
  }
  return dedented;
}
