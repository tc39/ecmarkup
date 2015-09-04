'use strict';

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
const ProdRef = require('./ProdRef');
const Grammar = require('./Grammar');
const Xref = require('./Xref');
const Eqn = require('./Eqn');
const Figure = require('./Figure');

const NO_CLAUSE_AUTOLINK = ['PRE', 'CODE', 'EMU-CLAUSE', 'EMU-ALG', 'EMU-PRODUCTION', 'EMU-GRAMMAR', 'EMU-XREF', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'EMU-EQN'];
const clauseTextNodesUnder = utils.textNodesUnder(NO_CLAUSE_AUTOLINK);
const NO_ALG_AUTOLINK = ['PRE', 'CODE', 'EMU-XREF'];
const algTextNodesUnder = utils.textNodesUnder(NO_ALG_AUTOLINK);

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
    this._numberer = ClauseNumbers.iterator();
    this._figureCounts = {
      table: 0,
      figure: 0
    };

    this.externalBiblio = {
      clauses: {},
      ops: {},
      productions: {},
      terms: {},
      examples: {},
      notes: {},
      tables: {},
      figures: {}
    };
    this.biblio = {
      clauses: {},
      ops: {},
      productions: {},
      terms: {},
      examples: {},
      notes: {},
      tables: {},
      figures: {}
    };
    this._prodsByName = {};

    this.processMetadata();
    assign(this.opts, opts);

    if (!this.opts.hasOwnProperty('toc')) {
      this.opts.toc = true;
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
      .then(this.loadES6Biblio.bind(this))
      .then(this.loadBiblios.bind(this))
      .then(this.buildAll.bind(this, 'emu-clause, emu-intro, emu-annex', Clause))
      .then(this.buildAll.bind(this, 'emu-grammar', Grammar))
      .then(this.buildAll.bind(this, 'emu-eqn', Eqn))
      .then(this.buildAll.bind(this, 'emu-alg', Algorithm))
      .then(this.buildAll.bind(this, 'emu-production', Production))
      .then(this.buildAll.bind(this, 'emu-prodref', ProdRef))
      .then(this.buildAll.bind(this, 'emu-figure, emu-table', Figure))
      .then(this.buildAll.bind(this, 'dfn', Dfn))
      .then(this.highlightCode.bind(this))
      .then(this.autolink.bind(this))
      .then(this.buildAll.bind(this, 'emu-xref', Xref));

    if (this.opts.toc) {
      p = p.then(function() {
        this._log('Building table of contents...');

        let toc;

        if (this.opts.oldToc) {
          toc = new Toc(this);
        } else {
          toc = new Menu(this);
        }
        return toc.build();
      }.bind(this));
    }

    return p.then(function () { return this; }.bind(this), function (err) {
      process.stderr.write(err.stack);
    });
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

    assign(this.opts, data);
  }

  loadES6Biblio() {
    this._log('Loading biblios...');

    return this.fetch(Path.join(__dirname, '../es6biblio.json'))
      .then(function (es6bib) {
        importBiblio(this.externalBiblio, JSON.parse(es6bib));
      }.bind(this));
  }

  loadBiblios() {
    const spec = this;

    const bibs = Array.prototype.slice.call(this.doc.querySelectorAll('emu-biblio'));

    return Promise.all(
      bibs.map(function (bib) {
        const path = Path.join(spec.rootDir, bib.getAttribute('href'));

        return spec.fetch(path)
          .then(function (contents) {
            importBiblio(spec.externalBiblio, JSON.parse(contents));
          });
      })
    );
  }

  exportBiblio() {
    if (!this.opts.location) {
      utils.logWarning('no spec location specified. Biblio not generated. Try --location or setting the location in the document\'s metadata block.');
      return {};
    }

    const biblio = {};
    biblio[this.opts.location] = this.biblio;

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

  autolink() {
    this._log('Autolinking terms and abstract ops...');
    const termlinkmap = {};
    const autolinkmap = {};

    Object.keys(this.externalBiblio.terms).forEach(function (term) {
      autolinkmap[term] = this.externalBiblio.terms[term];
      termlinkmap[term] = this.externalBiblio.terms[term];
    }, this);

    Object.keys(this.externalBiblio.ops).filter(noCommonAbstractOps).forEach(function (op) {
      autolinkmap[op] = this.externalBiblio.ops[op];
    }, this);

    Object.keys(this.biblio.terms).forEach(function (term) {
      autolinkmap[term] = this.biblio.terms[term];
      termlinkmap[term] = this.biblio.terms[term];
    }, this);

    Object.keys(this.biblio.ops).filter(noCommonAbstractOps).forEach(function (op) {
      autolinkmap[op] = this.biblio.ops[op];
    }, this);

    const clauseReplacer = new RegExp(Object.keys(autolinkmap)
      .sort(function (a, b) { return b.length - a.length; })
      .map(function (k) { return '\\b' + k + '\\b'; })
      .join('|'), 'g');

    const algReplacer = new RegExp(Object.keys(termlinkmap)
      .sort(function (a, b) { return b.length - a.length; })
      .map(function (k) { return '\\b' + k + '\\b'; })
      .join('|'), 'g');

    autolinkWalk(clauseReplacer, autolinkmap, this, this);

    const algs = this.doc.getElementsByTagName('emu-alg');
    for (let i = 0; i < algs.length; i++) {
      const alg = algs[i];
      autolink(algReplacer, termlinkmap, this, alg);
    }
  }

  lookupBiblioEntryById(id) {
    const types = ['clause', 'production', 'example', 'note', 'figure', 'table'];
    for (let i = 0; i < types.length; i++) {
      const type = types[i];
      const entry = this.spec.biblio[type + 's'][id] || this.spec.externalBiblio[type + 's'][id];
      if (entry) {
        return { type: type, entry: entry };
      }
    }

    return null;
  }

  _log(str) {
    if (!this.opts.verbose) return;
    utils.logVerbose(str);
  }
};


function importBiblio(target, source) {
  Object.keys(source).forEach(function (site) {
    Object.keys(source[site]).forEach(function (type) {
      Object.keys(source[site][type]).forEach(function (entry) {
        target[type][entry] = source[site][type][entry];
        target[type][entry].location = site;
      });
    });
  });
}

function autolinkWalk(replacer, autolinkmap, spec, rootClause) {
  rootClause.subclauses.forEach(function (subclause) {
    autolink(replacer, autolinkmap, spec, subclause.node, subclause.id);
    autolinkWalk(replacer, autolinkmap, spec, subclause);
  });
}

function autolink(replacer, autolinkmap, spec, node, parentId) {
  const textNodes = clauseTextNodesUnder(node);

  for (let i = 0; i < textNodes.length; i++) {
    const node = textNodes[i];

    const template = spec.doc.createElement('template');
    const content = escape(node.textContent);
    const autolinked = content.replace(replacer, function (match) {
      const entry = autolinkmap[match];
      if (!entry || entry.id === parentId) {
        return match;
      }

      if (entry.aoid) {
        return '<emu-xref aoid="' + entry.aoid + '">' + match + '</emu-xref>';
      } else {
        return '<emu-xref href="#' + entry.id + '">' + match + '</emu-xref>';
      }
    });

    if (autolinked !== content) {
      template.innerHTML = autolinked;
      utils.replaceTextNode(node, template);
    }
  }
}

function noCommonAbstractOps(op) {
  return op !== 'Call' && op !== 'Set' && op !== 'Type' && op !== 'UTC';
}

function assign(target, source) {
  Object.keys(source).forEach(function (k) {
    target[k] = source[k];
  });
}
