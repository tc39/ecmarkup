# Generating a PDF from ecmarkup

## Required frontmatter

- In order to produce a PDF, the front matter `title`, `shortname`, and `status` are **mandatory**.

```yaml
title: Temporal proposal
shortname: Temporal
status: proposal
stage: 3
```

- You can also specify various boilerplate content (see the boilerplate/ directory)  For example:

```yaml
title: ECMAScript® Language Specification
shortname: ECMA-262
status: draft
boilerplate:
  copyright: alternative
```

- If generating a version for submission to the GA, `version` and `date` are mandatory. `date` should reflect the date of the Ecma GA which will ratify the Standard.

```yaml
title: ECMAScript® 2025 Language Specification
shortname: ECMA-262
version: 16<sup>th</sup> Edition
date: 2025-06-25
status: standard
boilerplate:
  copyright: alternative
location: https://262.ecma-international.org/16.0/
```

## Build and print

To generate markup for use in PDF conversion, make sure to include the options `--assets`, `--assets-dir`, and `--printable`. If you have images and styles to include, make sure to move them into your assets directory before running `ecmarkup`. For example:

```shell
mkdir -p out && \
cp -R images out && \
ecmarkup --assets external --assets-dir out --printable spec.html out/index.html
```

Then, from your spec's working directory, run [`prince-books`](https://www.princexml.com/) to generate your PDF.

```shell
cd path/to/spec
prince-books --script ./node_modules/ecmarkup/js/print.js out/index.html -o path/to/output.pdf
```

This has been extensively tested with [Prince Books](https://www.princexml.com/books/), built off of Prince 15. Earlier and later editions not guaranteed. CSS rule-specific documentation available in css/print.css.
