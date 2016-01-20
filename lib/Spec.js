'use strict';

const path = require('path');
const fs = require('fs');
const Path = require('path');
const yaml = require('js-yaml');
const utils = require('./utils');
const hljs = require('highlight.js');
const escape = require('html-escape');

// Builders
const Import = require('./Import');
const Clause = require('./Clause');
const ClauseNumbers = require('./clauseNums');
const Algorithm = require('./Algorithm');
const Dfn = require('./Dfn');
const Note = require('./Note');
const Toc = require('./Toc');
const Menu = require('./Menu');
const Production = require('./Production');
const NonTerminal = require('./NonTerminal');
const ProdRef = require('./ProdRef');
const Grammar = require('./Grammar');
const Xref = require('./Xref');
const Eqn = require('./Eqn');
const Figure = require('./Figure');
const Biblio = require('./Biblio');

const NO_CLAUSE_AUTOLINK = ['PRE', 'CODE', 'EMU-CLAUSE', 'EMU-PRODUCTION', 'EMU-GRAMMAR', 'EMU-XREF', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'EMU-EQN', 'EMU-ALG'];
const clauseTextNodesUnder = utils.textNodesUnder(NO_CLAUSE_AUTOLINK);
const NO_ALG_AUTOLINK = ['PRE', 'CODE', 'EMU-XREF'];
const algTextNodesUnder = utils.textNodesUnder(NO_ALG_AUTOLINK);

const DRAFT_DATE_FORMAT = { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' };
const STANDARD_DATE_FORMAT = { year: 'numeric', month: 'long', timeZone: 'UTC' };


module.exports = class Spec {
  constructor (rootPath, fetch, doc, opts) {
    opts = opts || {};

    this.spec = this;
    this.opts = {};
    this.rootPath = rootPath;
    this.rootDir = Path.dirname(this.rootPath);
    this.doc = doc;
    this.fetch = fetch;
    this.subclauses = [];
    this.imports = [];
    this.node = this.doc.body;
    this._numberer = ClauseNumbers.iterator();
    this._figureCounts = {
      table: 0,
      figure: 0
    };

    this.biblio = new Biblio();

    this.processMetadata();
    Object.assign(this.opts, opts);

    if (!this.opts.hasOwnProperty('status')) {
      this.opts.status = 'proposal';
    }

    if (!this.opts.hasOwnProperty('toc')) {
      this.opts.toc = true;
    }

    if (!this.opts.hasOwnProperty('copyright')) {
      this.opts.copyright = true;
    }

    if (!this.opts.date) {
      this.opts.date = new Date();
    }

    if (this.opts.stage) {
      this.opts.stage = String(this.opts.stage);
    } else if (this.opts.status === 'proposal') {
      this.opts.stage = '0';
    } else {
      this.opts.stage = null;
    }
  }

  buildAll(selector, Builder, opts) {
    opts = opts || {};


    let elems;
    if (typeof selector === 'string') {
      this._log('Building ' + selector + '...');
      elems = this.doc.querySelectorAll(selector);
    } else {
      elems = selector;
    }

    const builders = [];
    const ps = [];

    for (let i = 0; i < elems.length; i++) {
      const b = new Builder(this, elems[i]);
      builders.push(b);
    }

    if (opts.buildArgs) {
      for (let i = 0; i < elems.length; i++) {
        ps.push(builders[i].build.apply(builders[i], opts.buildArgs));
      }
    } else {
      for (let i = 0; i < elems.length; i++) {
        ps.push(builders[i].build());
      }
    }

    return Promise.all(ps);
  }

  build() {
    let p = this.buildAll('emu-import', Import)
      .then(this.buildBoilerplate.bind(this))
      .then(this.loadES6Biblio.bind(this))
      .then(this.loadBiblios.bind(this))
      .then(this.buildAll.bind(this, 'emu-clause, emu-intro, emu-annex', Clause))
      .then(this.buildAll.bind(this, 'emu-grammar', Grammar))
      .then(this.buildAll.bind(this, 'emu-eqn', Eqn))
      .then(this.buildAll.bind(this, 'emu-alg', Algorithm))
      .then(this.buildAll.bind(this, 'emu-production', Production))
      .then(this.buildAll.bind(this, 'emu-nt', NonTerminal))
      .then(this.buildAll.bind(this, 'emu-prodref', ProdRef))
      .then(this.buildAll.bind(this, 'emu-figure, emu-table', Figure))
      .then(this.buildAll.bind(this, 'dfn', Dfn))
      .then(this.highlightCode.bind(this))
      .then(this.autolink.bind(this))
      .then(this.buildAll.bind(this, 'emu-xref', Xref))
      .then(this.setCharset.bind(this));

    if (this.opts.toc) {
      p = p.then(() => {
        this._log('Building table of contents...');

        let toc;

        if (this.opts.oldToc) {
          toc = new Toc(this);
        } else {
          toc = new Menu(this);
        }
        return toc.build();
      });
    }

    return p.then(() => this, err => process.stderr.write(err.stack));
  }

  toHTML() {
    return '<!doctype html>\n' + this.doc.documentElement.innerHTML;
  }

  processMetadata() {
    const block = this.doc.querySelector('pre.metadata');
    if (!block) {
      return;
    }

    let data;
    try {
      data = yaml.safeLoad(block.textContent);
    } catch (e) {
      utils.logWarning('metadata block failed to parse');
      return;
    } finally {
      block.parentNode.removeChild(block);
    }

    Object.assign(this.opts, data);
  }

  loadES6Biblio() {
    this._log('Loading biblios...');

    return this.fetch(Path.join(__dirname, '../es6biblio.json'))
      .then(es6bib => this.biblio.addExternalBiblio(JSON.parse(es6bib)));
  }

  loadBiblios() {
    const spec = this;

    const bibs = Array.prototype.slice.call(this.doc.querySelectorAll('emu-biblio'));

    return Promise.all(
      bibs.map(bib => {
        const path = Path.join(spec.rootDir, bib.getAttribute('href'));

        return spec.fetch(path)
          .then(contents => this.biblio.addExternalBiblio(JSON.parse(contents)));
      })
    );
  }

  exportBiblio() {
    if (!this.opts.location) {
      utils.logWarning('No spec location specified. Biblio not generated. Try --location or setting the location in the document\'s metadata block.');
      return {};
    }

    const biblio = {};
    biblio[this.opts.location] = this.biblio.toJSON();

    return biblio;
  }

  getNextClauseNumber(depth, isAnnex) {
    return this._numberer.next(depth, isAnnex).value;
  }

  highlightCode() {
    this._log('Highlighting syntax...');
    const codes = this.doc.querySelectorAll('pre code');
    for (let i = 0; i < codes.length; i++) {
      const classAttr = codes[i].getAttribute('class');
      if (!classAttr) continue;

      const lang = classAttr.replace(/lang(uage)?\-/, '');
      const result = hljs.highlight(lang, codes[i].textContent);
      codes[i].innerHTML = result.value;
      codes[i].setAttribute('class', classAttr + ' hljs');
    }
  }

  buildBoilerplate() {
    const status = this.opts.status;
    const version = this.opts.version;
    const title = this.opts.title;
    const shortname = this.opts.shortname;
    const stage = this.opts.stage;

    if (this.opts.copyright) {
      if (status !== 'draft' && status !== 'standard' && !this.opts.contributors) {
        utils.logWarning('Contributors not specified, skipping copyright boilerplate. Specify contributors in your frontmatter metadata.');
      } else {
        this.buildCopyrightBoilerplate();
      }
    }

    // no title boilerplate generated if title not specified
    if (!title) return;

    // title
    if (title && !this._updateBySelector('title', title)) {
      const titleElem = this.doc.createElement('title');
      titleElem.innerHTML = title;
      this.doc.head.appendChild(titleElem);

      const h1 = this.doc.createElement('h1');
      h1.setAttribute('class', 'title');
      h1.innerHTML = title;
      this.doc.body.insertBefore(h1, this.doc.body.firstChild);
    }

    // version string, ala 6th Edition July 2016 or Draft 10 / September 26, 2015
    let versionText = '';
    if (version) {
      versionText += version + ' / ';
    } else if (status === 'proposal' && stage) {
      versionText += 'Stage ' + stage + ' Draft / ';
    }

    const defaultDateFormat = status === 'standard' ? STANDARD_DATE_FORMAT : DRAFT_DATE_FORMAT;
    const date = new Intl.DateTimeFormat('en-US', defaultDateFormat).format(this.opts.date);
    versionText += date;

    if (!this._updateBySelector('h1.version', versionText)) {
      const h1 = this.doc.createElement('h1');
      h1.setAttribute('class', 'version');
      h1.innerHTML = versionText;
      this.doc.body.insertBefore(h1, this.doc.body.firstChild);
    }

    // shortname and status, ala 'Draft ECMA-262
    if (shortname) {
      const shortnameText = status.charAt(0).toUpperCase() + status.slice(1) + ' ' + shortname;

      if (!this._updateBySelector('h1.shortname', shortnameText)) {
        const h1 = this.doc.createElement('h1');
        h1.setAttribute('class', 'shortname');
        h1.innerHTML = shortnameText;
        this.doc.body.insertBefore(h1, this.doc.body.firstChild);
      }
    }
  }

  buildCopyrightBoilerplate() {
    let copyright;
    let address;

    if (this.opts.status === 'draft') {
      copyright = getBoilerplate('draft-copyright');
      address = getBoilerplate('address');
    } else if (this.opts.status === 'standard') {
      copyright = getBoilerplate('standard-copyright');
      address = getBoilerplate('address');
    } else {
      copyright = getBoilerplate('proposal-copyright');
      address = '';
    }

    copyright = copyright.replace(/!YEAR!/g, this.opts.date.getFullYear());

    if (this.opts.contributors) {
      copyright = copyright.replace(/!CONTRIBUTORS!/g, this.opts.contributors);
    }

    const softwareLicense = getBoilerplate('software-license');

    let copyrightClause = this.doc.querySelector('.copyright-and-software-license');
    if (!copyrightClause) {

      let last;
      utils.domWalkBackward(this.doc.body, node => {
        if (last) return false;
        if (node.nodeName === 'EMU-CLAUSE' || node.nodeName === 'EMU-ANNEX') {
          last = node;
          return false;
        }
      });

      copyrightClause = this.doc.createElement('emu-annex');
      copyrightClause.setAttribute('id', 'sec-copyright-and-software-license');

      if (last) {
        last.parentNode.insertBefore(copyrightClause, last.nextSibling);
      } else {
        this.doc.body.appendChild(copyrightClause);
      }
    }

    copyrightClause.innerHTML = `
      <h1>Copyright &amp; Software License</h1>
      ${address}
      <h2>Copyright Notice</h2>
      ${copyright.replace('!YEAR!', this.opts.date.getFullYear())}
      <h2>Software License</h2>
      ${softwareLicense}
    `;

  }

  autolink() {
    this._log('Autolinking terms and abstract ops...');
    const autolinkmap = {};

    this.biblio.byType('term')
      .forEach(entry => autolinkmap[entry.key.toLowerCase()] = entry);

    this.biblio.byType('op')
      .forEach(entry => autolinkmap[entry.key.toLowerCase()] = entry);

    const clauseReplacer = new RegExp(Object.keys(autolinkmap)
      .sort(function (a, b) { return b.length - a.length; })
      .map(function (k) {
        const entry = autolinkmap[k];
        const key = entry.key;

        if (entry.type === 'term') {
          if (isCommonTerm(key)) {
            return '\\b' + key + '\\b(?!\\.\\w|%%|\\]\\])';
          } else if(key[0].match(/[A-Za-z0-9]/)) {
            return '\\b' + caseInsensitiveRegExp(key) + '\\b(?!\\.\\w|%%|\\]\\])';
          } else {
            return key
          }
        } else {
          // type is "op"
          if (isCommonAbstractOp(key)) {
            return '\\b' + key + '\\b(?=\\()';
          } else {
            return '\\b' + key + '\\b(?!\\.\\w|%%|\\]\\])';
          }
        }
      })
      .join('|'), 'g');
      console.log(clauseReplacer);

    autolinkWalk(clauseReplacer, autolinkmap, this, this);

    let algs = this.doc.querySelectorAll('emu-alg, emu-eqn');
    for (let i = 0; i < algs.length; i++) {
      autolink(clauseReplacer, autolinkmap, this, algs[i], this.node.id, true);
    }
  }

  setCharset() {
    let current = this.spec.doc.querySelector('meta[charset]');

    if (!current) {
      current = this.spec.doc.createElement('meta');
      this.spec.doc.head.insertBefore(current, this.spec.doc.head.firstChild);
    }

    current.setAttribute('charset', 'utf-8');
  }

  _log(str) {
    if (!this.opts.verbose) return;
    utils.logVerbose(str);
  }

  _updateBySelector(selector, contents) {
    const elem = this.doc.querySelector(selector);
    if (elem && elem.textContent.trim().length > 0) {
      return true;
    }

    if (elem) {
      elem.innerHTML = contents;
      return true;
    }

    return false;
  }
};

function importBiblio(target, source) {
  Object.keys(source).forEach(site => {
    Object.keys(source[site]).forEach(type => {
      source[site][type].forEach(entry => {
        entry.location = site;
        target[type].push(entry);
      });
    });
  });
}

function autolinkWalk(replacer, autolinkmap, spec, rootClause) {
  autolink(replacer, autolinkmap, spec, rootClause.node, rootClause.id);
  rootClause.subclauses.forEach(subclause => {
    autolinkWalk(replacer, autolinkmap, spec, subclause);
  });
}

function autolink(replacer, autolinkmap, spec, node, parentId, allowSameId) {
  const textNodes = clauseTextNodesUnder(node);

  for (let i = 0; i < textNodes.length; i++) {
    const node = textNodes[i];

    const template = spec.doc.createElement('template');
    const content = escape(node.textContent);
    const autolinked = content.replace(replacer, match => {
      const entry = autolinkmap[match.toLowerCase()];
      if (!entry || ((entry.id === parentId || entry.refId === parentId) && !allowSameId)) {
        return match;
      }

      if (entry.aoid) {
        return '<emu-xref aoid="' + entry.aoid + '">' + match + '</emu-xref>';
      } else {
        return '<emu-xref href="#' + (entry.id || entry.refId) + '">' + match + '</emu-xref>';
      }
    });

    if (autolinked !== content) {
      template.innerHTML = autolinked;
      utils.replaceTextNode(node, template.content);
    }
  }
}

function isCommonAbstractOp(op) {
  return op === 'Call' || op === 'Set' || op === 'Type' || op === 'UTC' || op === 'min' || op === 'max';
}

function isCommonTerm(op) {
  return op === 'List' || op === 'Reference' || op === 'Record';
}

function assign(target, source) {
  Object.keys(source).forEach(function (k) {
    target[k] = source[k];
  });
}

function getBoilerplate(file) {
  return fs.readFileSync(Path.join(__dirname, '../boilerplate', file + '.html'), 'utf8');
}

function caseInsensitiveRegExp(str) {
  let lower = str[0].toLowerCase();

  if (lower !== str[0]) return str;

  let upper = lower.toUpperCase();
  if (lower === upper) {
    return str;
  }

  return `[${lower}${upper}]${str.slice(1)}`;
}
