import path = require('path');
import fs = require('fs');
import Path = require('path');
import yaml = require('js-yaml');
import utils = require('./utils');
import hljs = require('highlight.js');
import escape = require('html-escape');
import { Options } from './ecmarkup';
import _Builder = require('./Builder');
// Builders
import Import = require('./Import');
import Clause = require('./Clause');
import ClauseNumbers = require('./clauseNums');
import Algorithm = require('./Algorithm');
import Dfn = require('./Dfn');
import Note = require('./Note');
import Toc = require('./Toc');
import Menu = require('./Menu');
import Production = require('./Production');
import NonTerminal = require('./NonTerminal');
import ProdRef = require('./ProdRef');
import Grammar = require('./Grammar');
import Xref = require('./Xref');
import Eqn = require('./Eqn');
import Figure = require('./Figure');
import Biblio = require('./Biblio');
import autolinker = require('./autolinker');

const DRAFT_DATE_FORMAT = { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' };
const STANDARD_DATE_FORMAT = { year: 'numeric', month: 'long', timeZone: 'UTC' };

interface Spec {
  spec: this;
  opts: Options;
  rootPath: string;
  rootDir: string;
  namespace: string;
  toHTML(): string;
  exportBiblio(): any;
}

/*@internal*/
class Spec {
  spec: this;
  opts: Options;
  rootPath: string;
  rootDir: string;
  namespace: string;
  biblio: Biblio;
  doc: Document;
  imports: string[];
  node: HTMLElement;
  fetch: (file: string) => PromiseLike<string>;
  subclauses: Clause[];
  _figureCounts: { [type: string]: number };
  private _numberer: ClauseNumbers.ClauseNumberIterator;

  constructor (rootPath: string, fetch: (file: string) => PromiseLike<string>, doc: HTMLDocument, opts?: Options) {
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

    if (!this.opts.location) {
      this.opts.location = '<no location>';
    }

    this.namespace = this.opts.location;

    this.biblio = new Biblio(this.opts.location);
  }

  public buildAll(selector: string | NodeListOf<HTMLElement>, Builder: typeof _Builder, opts?: any): PromiseLike<any> {
    type Builder = _Builder;
    opts = opts || {};


    let elems: NodeListOf<HTMLElement>;
    if (typeof selector === 'string') {
      this._log('Building ' + selector + '...');
      elems = this.doc.querySelectorAll(selector) as NodeListOf<HTMLElement>;
    } else {
      elems = selector;
    }

    const builders: Builder[] = [];
    const ps: any[] = [];

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

  public build() {
    let p: PromiseLike<any> = this.buildAll('emu-import', Import)
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

        let toc: Toc | Menu;

        if (this.opts.oldToc) {
          toc = new Toc(this);
        } else {
          toc = new Menu(this);
        }
        return toc.build();
      });
    }

    return p.then(() => this);
  }

  public toHTML() {
    return '<!doctype html>\n' + this.doc.documentElement.innerHTML;
  }

  private processMetadata() {
    const block = this.doc.querySelector('pre.metadata');
    if (!block) {
      return;
    }

    let data: any;
    try {
      data = yaml.safeLoad(block.textContent!);
    } catch (e) {
      utils.logWarning('metadata block failed to parse');
      return;
    } finally {
      block.parentNode.removeChild(block);
    }

    Object.assign(this.opts, data);
  }

  private loadES6Biblio() {
    this._log('Loading biblios...');

    return this.fetch(Path.join(__dirname, '../es6biblio.json'))
      .then(es6bib => this.biblio.addExternalBiblio(JSON.parse(es6bib)));
  }

  private loadBiblios() {
    const spec = this;

    const bibs: HTMLElement[] = Array.prototype.slice.call(this.doc.querySelectorAll('emu-biblio'));

    return Promise.all(
      bibs.map(bib => {
        const path = Path.join(spec.rootDir, bib.getAttribute('href'));

        return spec.fetch(path)
          .then(contents => this.biblio.addExternalBiblio(JSON.parse(contents)));
      })
    );
  }

  public exportBiblio(): any {
    if (!this.opts.location) {
      utils.logWarning('No spec location specified. Biblio not generated. Try --location or setting the location in the document\'s metadata block.');
      return {};
    }

    const biblio: Biblio.BiblioData = {};
    biblio[this.opts.location] = this.biblio.toJSON();

    return biblio;
  }

  getNextClauseNumber(depth: number, isAnnex: boolean) {
    return this._numberer.next(depth, isAnnex).value;
  }

  private highlightCode() {
    this._log('Highlighting syntax...');
    const codes = this.doc.querySelectorAll('pre code');
    for (let i = 0; i < codes.length; i++) {
      const classAttr = codes[i].getAttribute('class');
      if (!classAttr) continue;

      const lang = classAttr.replace(/lang(uage)?\-/, '');
      let input = codes[i].textContent!;

      // remove leading and trailing blank lines
      input = input.replace(/^(\s*[\r\n])+|([\r\n]\s*)+$/g, '');

      // remove base inden based on indent of first non-blank line
      const baseIndent = input.match(/^\s*/) || '';
      const baseIndentRe = new RegExp('^' + baseIndent, 'gm');
      input = input.replace(baseIndentRe, '');

      const result = hljs.highlight(lang, input);
      codes[i].innerHTML = result.value;
      codes[i].setAttribute('class', classAttr + ' hljs');
    }
  }

  private buildBoilerplate() {
    const status = this.opts.status!;
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

  private buildCopyrightBoilerplate() {
    let copyright: string;
    let address: string;

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

    copyright = copyright.replace(/!YEAR!/g, "" + this.opts.date!.getFullYear());

    if (this.opts.contributors) {
      copyright = copyright.replace(/!CONTRIBUTORS!/g, this.opts.contributors);
    }

    const softwareLicense = getBoilerplate('software-license');

    let copyrightClause = this.doc.querySelector('.copyright-and-software-license');
    if (!copyrightClause) {

      let last: HTMLElement | undefined;
      utils.domWalkBackward(this.doc.body, node => {
        if (last) return false;
        if (node.nodeName === 'EMU-CLAUSE' || node.nodeName === 'EMU-ANNEX') {
          last = node as HTMLElement;
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
      ${copyright.replace('!YEAR!', "" + this.opts.date!.getFullYear())}
      <h2>Software License</h2>
      ${softwareLicense}
    `;

  }

  public autolink() {
    this._log('Autolinking terms and abstract ops...');
    autolinker.link(this);
  }

  public setCharset() {
    let current = this.spec.doc.querySelector('meta[charset]');

    if (!current) {
      current = this.spec.doc.createElement('meta');
      this.spec.doc.head.insertBefore(current, this.spec.doc.head.firstChild);
    }

    current.setAttribute('charset', 'utf-8');
  }

  private _log(str: string) {
    if (!this.opts.verbose) return;
    utils.logVerbose(str);
  }

  private _updateBySelector(selector: string, contents: string) {
    const elem = this.doc.querySelector(selector);
    if (elem && elem.textContent!.trim().length > 0) {
      return true;
    }

    if (elem) {
      elem.innerHTML = contents;
      return true;
    }

    return false;
  }
};

function assign(target: any, source: any) {
  Object.keys(source).forEach(function (k) {
    target[k] = source[k];
  });
}

function getBoilerplate(file: string) {
  return fs.readFileSync(Path.join(__dirname, '../boilerplate', file + '.html'), 'utf8');
}

export = Spec;