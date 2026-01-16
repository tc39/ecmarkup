import type { ElementLocation } from 'parse5';
import type { EcmarkupError, Options } from './ecmarkup';
import type {
  OneOfList,
  RightHandSide,
  SourceFile,
  Production as GMDProduction,
} from 'grammarkdown';
import type { Context } from './Context';
import type { ExportedBiblio, StepBiblioEntry } from './Biblio';
import type { BuilderInterface } from './Builder';

import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import * as yaml from 'js-yaml';
import * as utils from './utils';
import * as hljs from 'highlight.js';
// Builders
import { buildImports } from './Import';
import type { Import, EmuImportElement } from './Import';
import Clause from './Clause';
import ClauseNumbers from './clauseNums';
import Algorithm from './Algorithm';
import Table from './Table';
import Dfn from './Dfn';
import Example from './Example';
import Figure from './Figure';
import Note from './Note';
import Toc from './Toc';
import makeMenu from './Menu';
import Production from './Production';
import NonTerminal from './NonTerminal';
import ProdRef from './ProdRef';
import Grammar from './Grammar';
import Xref from './Xref';
import Eqn from './Eqn';
import Biblio from './Biblio';
import Meta from './Meta';
import H1 from './H1';
import {
  autolink,
  replacerForNamespace,
  NO_CLAUSE_AUTOLINK,
  YES_CLAUSE_AUTOLINK,
} from './autolinker';
import { lint } from './lint/lint';
import { CancellationToken } from 'prex';
import type { JSDOM } from 'jsdom';
import { getProductions, rhsMatches, getLocationInGrammarFile } from './lint/utils';
import type { AugmentedGrammarEle } from './Grammar';
import { zip } from './utils';
import { typecheck } from './typechecker';
import ConcreteMethodDfns from './ConcreteMethodDfns';

const DRAFT_DATE_FORMAT: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  timeZone: 'UTC',
};
const STANDARD_DATE_FORMAT: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: 'long',
  timeZone: 'UTC',
};
const NO_EMD = new Set([
  'PRE',
  'CODE',
  'SCRIPT',
  'STYLE',
  'EMU-PRODUCTION',
  'EMU-ALG',
  'EMU-GRAMMAR',
  'EMU-EQN',
]);
const YES_EMD = new Set(['EMU-GMOD']); // these are processed even if they are nested in NO_EMD contexts

// maps PostScript font names to files in fonts/
const FONT_FILES = new Map([
  ['IBMPlexSerif-Regular', 'IBMPlexSerif-Regular-SlashedZero.woff2'],
  ['IBMPlexSerif-Bold', 'IBMPlexSerif-Bold-SlashedZero.woff2'],
  ['IBMPlexSerif-Italic', 'IBMPlexSerif-Italic-SlashedZero.woff2'],
  ['IBMPlexSerif-BoldItalic', 'IBMPlexSerif-BoldItalic-SlashedZero.woff2'],
  ['IBMPlexSans-Regular', 'IBMPlexSans-Regular-SlashedZero.woff2'],
  ['IBMPlexSans-Bold', 'IBMPlexSans-Bold-SlashedZero.woff2'],
  ['IBMPlexSans-Italic', 'IBMPlexSans-Italic-SlashedZero.woff2'],
  ['IBMPlexSans-BoldItalic', 'IBMPlexSans-BoldItalic-SlashedZero.woff2'],
  ['IBMPlexMono-Regular', 'IBMPlexMono-Regular-SlashedZero.woff2'],
  ['IBMPlexMono-Bold', 'IBMPlexMono-Bold-SlashedZero.woff2'],
  ['IBMPlexMono-Italic', 'IBMPlexMono-Italic-SlashedZero.woff2'],
  ['IBMPlexMono-BoldItalic', 'IBMPlexMono-BoldItalic-SlashedZero.woff2'],
]);

const IMG_FILES = new Set(['ecma-header.svg', 'print-front-cover.svg', 'print-inside-cover.svg']);

interface VisitorMap {
  [k: string]: BuilderInterface;
}

interface TextNodeContext {
  clause: Spec | Clause;
  node: Node;
  inAlg: boolean;
  currentId: string | null;
}

const builders: BuilderInterface[] = [
  Clause,
  Algorithm,
  Xref,
  Table,
  ConcreteMethodDfns,
  Dfn,
  Eqn,
  Grammar,
  Production,
  Example,
  Figure,
  NonTerminal,
  ProdRef,
  Note,
  Meta,
  H1,
];

const visitorMap = builders.reduce((map, T) => {
  T.elements.forEach(e => (map[e] = T));
  return map;
}, {} as VisitorMap);

export type Warning =
  | {
      type: 'global';
      ruleId: string;
      message: string;
    }
  | {
      type: 'node';
      node: Text | Element;
      ruleId: string;
      message: string;
    }
  | {
      type: 'attr';
      node: Element;
      attr: string;
      ruleId: string;
      message: string;
    }
  | {
      type: 'attr-value';
      node: Element;
      attr: string;
      ruleId: string;
      message: string;
    }
  | {
      type: 'contents';
      node: Text | Element;
      ruleId: string;
      message: string;
      nodeRelativeLine: number;
      nodeRelativeColumn: number;
    }
  | {
      type: 'raw';
      ruleId: string;
      message: string;
      line: number;
      column: number;
      file?: string;
      source?: string;
    };

function wrapWarn(source: string, spec: Spec, warn: (err: EcmarkupError) => void) {
  return (e: Warning) => {
    const { message, ruleId } = e;
    let line: number | undefined;
    let column: number | undefined;
    let nodeType: string;
    let file: string | undefined = undefined;
    switch (e.type) {
      case 'global':
        line = undefined;
        column = undefined;
        nodeType = 'html';
        break;
      case 'raw':
        ({ line, column } = e);
        nodeType = 'html';
        if (e.file != null) {
          file = e.file;
          source = e.source!;
        }
        break;
      case 'node':
        if (e.node.nodeType === 3 /* Node.TEXT_NODE */) {
          const loc = spec.locate(e.node);
          if (loc) {
            file = loc.file;
            source = loc.source;
            ({ startLine: line, startCol: column } = loc);
          }
          nodeType = 'text';
        } else {
          const loc = spec.locate(e.node as Element);
          if (loc) {
            file = loc.file;
            source = loc.source;
            ({ startLine: line, startCol: column } = loc.startTag);
          }
          nodeType = (e.node as Element).tagName.toLowerCase();
        }
        break;
      case 'attr': {
        const loc = spec.locate(e.node);
        if (loc) {
          file = loc.file;
          source = loc.source;
          ({ line, column } = utils.attrLocation(source, loc, e.attr));
        }
        nodeType = e.node.tagName.toLowerCase();
        break;
      }
      case 'attr-value': {
        const loc = spec.locate(e.node);
        if (loc) {
          file = loc.file;
          source = loc.source;
          ({ line, column } = utils.attrValueLocation(source, loc, e.attr));
        }
        nodeType = e.node.tagName.toLowerCase();
        break;
      }
      case 'contents': {
        const { nodeRelativeLine, nodeRelativeColumn } = e;
        if (e.node.nodeType === 3 /* Node.TEXT_NODE */) {
          // i.e. a text node, which does not have a tag
          const loc = spec.locate(e.node);
          if (loc) {
            file = loc.file;
            source = loc.source;
            line = loc.startLine + nodeRelativeLine - 1;
            column =
              nodeRelativeLine === 1 ? loc.startCol + nodeRelativeColumn - 1 : nodeRelativeColumn;
          }
          nodeType = 'text';
        } else {
          const loc = spec.locate(e.node);
          if (loc) {
            file = loc.file;
            source = loc.source;
            line = loc.startTag.endLine + nodeRelativeLine - 1;
            if (nodeRelativeLine === 1) {
              column = loc.startTag.endCol + nodeRelativeColumn - 1;
            } else {
              column = nodeRelativeColumn;
            }
          }
          nodeType = (e.node as Element).tagName.toLowerCase();
        }
        break;
      }
    }

    warn({
      message,
      ruleId,
      // we omit source for global errors so that we don't get a codeframe
      source: e.type === 'global' ? undefined : source,
      file,
      nodeType,
      line,
      column,
    });
  };
}

export type WorklistItem = { aoid: string | null; effects: string[] };
export function maybeAddClauseToEffectWorklist(
  effectName: string,
  clause: Clause,
  worklist: WorklistItem[],
) {
  if (
    !worklist.some(i => i.aoid === clause.aoid) &&
    clause.canHaveEffect(effectName) &&
    !clause.effects.includes(effectName)
  ) {
    clause.effects.push(effectName);
    worklist.push(clause);
  }
}

export default class Spec {
  spec: this;
  opts: Options;
  rootPath: string;
  rootDir: string;
  namespace: string;
  generatedFiles: Map<string | null, string | Buffer>;
  /** @internal */ assets:
    | { type: 'none' }
    | { type: 'inline' }
    | { type: 'external'; directory: string };
  /** @internal */ sourceText: string;
  /** @internal */ biblio: Biblio;
  /** @internal */ dom: JSDOM;
  /** @internal */ doc: Document;
  /** @internal */ imports: Import[];
  /** @internal */ node: HTMLElement;
  /** @internal */ nodeIds: Set<string>;
  /** @internal */ subclauses: Clause[];
  /** @internal */ replacementAlgorithmToContainedLabeledStepEntries: Map<
    Element,
    StepBiblioEntry[]
  >; // map from re to its labeled nodes
  /** @internal */ labeledStepsToBeRectified: Set<string>;
  /** @internal */ replacementAlgorithms: { element: Element; target: string }[];
  /** @internal */ cancellationToken: CancellationToken;

  readonly log: (msg: string) => void;
  readonly warn: (err: Warning) => void | undefined;

  /** @internal */ _figureCounts: { [type: string]: number };
  /** @internal */ _xrefs: Xref[];
  /** @internal */ _ntRefs: NonTerminal[];
  /** @internal */ _ntStringRefs: {
    name: string;
    loc: { line: number; column: number };
    node: Element | Text;
    namespace: string;
  }[];
  /** @internal */ _prodRefs: ProdRef[];
  /** @internal */ _concreteMethodDfnsLists: ConcreteMethodDfns[];
  /** @internal */ _textNodes: { [s: string]: [TextNodeContext] };
  /** @internal */ _effectWorklist: Map<string, WorklistItem[]>;
  /** @internal */ _effectfulAOs: Map<string, string[]>;
  /** @internal */ _emuMetasToRender: Set<HTMLElement>;
  /** @internal */ _emuMetasToRemove: Set<HTMLElement>;
  /** @internal */ refsByClause: { [refId: string]: [string] };
  /** @internal */ topLevelImportedNodes: Map<Node, EmuImportElement>;

  private _fetch: (file: string, token: CancellationToken) => PromiseLike<string>;

  constructor(
    rootPath: string,
    fetch: (file: string, token: CancellationToken) => PromiseLike<string>,
    dom: JSDOM,
    opts: Options = {},
    sourceText: string,
    token = CancellationToken.none,
  ) {
    this.spec = this;
    this.opts = {};
    this.rootPath = rootPath;
    this.rootDir = path.dirname(this.rootPath);
    this.sourceText = sourceText;
    this.doc = dom.window.document;
    this.dom = dom;
    this._fetch = fetch;
    this.subclauses = [];
    this.imports = [];
    this.node = this.doc.body;
    this.nodeIds = new Set();
    this.replacementAlgorithmToContainedLabeledStepEntries = new Map();
    this.labeledStepsToBeRectified = new Set();
    this.replacementAlgorithms = [];
    this.cancellationToken = token;
    this.generatedFiles = new Map();
    this.log = opts.log ?? (() => {});
    // TODO warnings should probably default to console.error, with a reasonable formatting
    this.warn = opts.warn ? wrapWarn(sourceText, this, opts.warn) : () => {};
    this._figureCounts = {
      table: 0,
      figure: 0,
    };
    this._xrefs = [];
    this._ntRefs = [];
    this._ntStringRefs = [];
    this._prodRefs = [];
    this._concreteMethodDfnsLists = [];
    this._textNodes = {};
    this._effectWorklist = new Map();
    this._effectfulAOs = new Map();
    this._emuMetasToRender = new Set();
    this._emuMetasToRemove = new Set();
    this.refsByClause = Object.create(null);
    this.topLevelImportedNodes = new Map();

    this.processMetadata();
    Object.assign(this.opts, opts);

    if (this.opts.jsOut || this.opts.cssOut) {
      throw new Error('--js-out and --css-out have been removed; use --assets-dir instead');
    }

    if (this.opts.oldToc) {
      throw new Error(
        '--old-toc has been removed; specify --printable to get a printable document',
      );
    }

    if (
      this.opts.assets != null &&
      this.opts.assets !== 'external' &&
      this.opts.assetsDir != null
    ) {
      throw new Error(`--assets=${this.opts.assets} cannot be used with --assets-dir"`);
    }

    if (this.opts.printable) {
      if (this.opts.title == null) {
        throw new Error(`--printable requires a title to be set in the metadata"`);
      }
      if (this.opts.shortname == null) {
        throw new Error(`--printable requires a shortname to be set in the metadata"`);
      }
    }

    if (this.opts.multipage) {
      this.opts.outfile ??= '';
      const type = this.opts.assets ?? 'external';
      if (type === 'inline') {
        throw new Error('assets cannot be inline for multipage builds');
      } else if (type === 'none') {
        this.assets = { type: 'none' };
      } else {
        this.assets = {
          type: 'external',
          directory: this.opts.assetsDir ?? path.join(this.opts.outfile, 'assets'),
        };
      }
    } else {
      const type = this.opts.assets ?? (this.opts.assetsDir == null ? 'inline' : 'external');
      if (type === 'inline') {
        console.error('Warning: inlining assets; this should not be done for production builds.');
        this.assets = { type: 'inline' };
      } else if (type === 'none') {
        this.assets = { type: 'none' };
      } else {
        this.assets = {
          type: 'external',
          directory:
            this.opts.assetsDir ??
            (this.opts.outfile ? path.join(path.dirname(this.opts.outfile), 'assets') : 'assets'),
        };
      }
    }

    if (typeof this.opts.status === 'undefined') {
      this.opts.status = 'proposal';
    }

    if (typeof this.opts.toc === 'undefined') {
      this.opts.toc = true;
    }

    if (typeof this.opts.copyright === 'undefined') {
      this.opts.copyright = true;
    }

    if (!this.opts.date) {
      this.opts.date = new Date();
    }

    if (this.opts.stage != undefined) {
      this.opts.stage = String(this.opts.stage);
    }

    if (!this.opts.location) {
      this.opts.location = '<no location>';
    }

    this.namespace = this.opts.location;

    this.biblio = new Biblio(this.opts.location);
  }

  /** @internal */
  public fetch(file: string) {
    return this._fetch(file, this.cancellationToken);
  }

  /** @internal */
  public async build() {
    /*
    The Ecmarkup build process proceeds as follows:

    1. Load biblios, making xrefs and auto-linking from external specs work
    2. Load imports by recursively inlining the import files' content into the emu-import element
    3. Generate boilerplate text
    4. Do a walk of the DOM visting elements and text nodes. Text nodes are replaced by text and HTML nodes depending
       on content. Elements are built by delegating to builders. Builders work by modifying the DOM ahead of them so
       the new elements they make are visited during the walk. Elements added behind the current iteration must be
       handled specially (eg. see static exit method of clause). Xref, nt, and prodref's are collected for linking
       in the next step.
    5. Linking. After the DOM walk we have a complete picture of all the symbols in the document so we proceed to link
       the various xrefs to the proper place.
    6. Adding charset, highlighting code, etc.
    7. Add CSS & JS dependencies.
    */

    this.log('Loading biblios...');
    await this.loadBiblios();

    this.log('Loading imports...');
    await this.loadImports();

    this.log('Building boilerplate...');
    this.buildBoilerplate();

    const context: Context = {
      spec: this,
      node: this.doc.body,
      importStack: [],
      clauseStack: [],
      tagStack: [],
      clauseNumberer: ClauseNumbers(this),
      inNoAutolink: false,
      inAlg: false,
      inNoEmd: false,
      followingEmd: null,
      currentId: null,
    };

    const document = this.doc;

    if (this.opts.lintSpec) {
      this.log('Linting...');
      const source = this.sourceText;
      if (source === undefined) {
        throw new Error('Cannot lint when source text is not available');
      }
      await lint(this.warn, source, this, document);
    }

    this.log('Walking document, building various elements...');
    const walker = document.createTreeWalker(document.body, 1 | 4 /* elements and text nodes */);

    await walk(walker, context);

    const sdoJs = this.generateSDOMap();

    this.setReplacementAlgorithmOffsets();

    if (this.opts.lintSpec) {
      this.log('Checking types...');
      typecheck(this);
    }

    this.autolink();

    this.log('Propagating effect annotations...');
    this.propagateEffects();
    if (this.opts.printable) {
      this.log('Annotating external links...');
      this.annotateExternalLinks();
    }
    this.log('Generating concrete method definitions lists...');
    this._concreteMethodDfnsLists.forEach(cmd => cmd.build());
    this.log('Linking xrefs...');
    this._xrefs.forEach(xref => xref.build());
    this.log('Linking non-terminal references...');
    this._ntRefs.forEach(nt => nt.build());
    this._emuMetasToRender.forEach(node => {
      Meta.render(this, node);
    });
    this._emuMetasToRemove.forEach(node => {
      node.replaceWith(...node.childNodes);
    });

    // TODO: make these look good
    // this.log('Adding clause labels...');
    // this.labelClauses();

    if (this.opts.lintSpec) {
      this._ntStringRefs.forEach(({ name, loc, node, namespace }) => {
        if (this.biblio.byProductionName(name, namespace) == null) {
          this.warn({
            type: 'contents',
            ruleId: 'undefined-nonterminal',
            message: `could not find a definition for nonterminal ${name}`,
            node,
            nodeRelativeLine: loc.line,
            nodeRelativeColumn: loc.column,
          });
        }
      });
    }

    this.log('Linking production references...');
    this._prodRefs.forEach(prod => prod.build());
    this.log('Building reference graph...');
    this.buildReferenceGraph();

    this.highlightCode();
    this.setMetaCharset();
    this.setMetaViewport();
    const wrapper = this.buildSpecWrapper();

    if (this.opts.printable) {
      this.log('Building covers and applying other print tweaks...');

      const intro = this.doc.querySelector('emu-intro');

      if (this.opts.status === 'standard') {
        if (this.opts.committee) {
          const adoptionInfo = this.doc.createElement('p');

          adoptionInfo.classList.add('adoption-info');
          adoptionInfo.innerHTML = `This Ecma Standard was developed by Technical Committee ${this.opts.committee} and was adopted by the General Assembly of ${Intl.DateTimeFormat('en-GB-oxendict', { month: 'long', year: 'numeric' }).format(this.opts.date)}.`;
          intro!.appendChild(adoptionInfo);
        } else {
          throw new Error(
            '"standard" status requires a technical committee be defined in the "committee" field of the metadata.',
          );
        }
      }

      const metadataEle = this.doc.querySelector('#metadata-block');
      if (metadataEle) {
        intro!.appendChild(metadataEle);
      }

      // front cover
      const frontCover = document.createElement('div');

      frontCover.classList.add('full-page-svg');
      frontCover.setAttribute('id', 'front-cover');

      const versionNode = this.doc.querySelector('h1.version');
      if (versionNode != null) {
        frontCover.append(versionNode);
      }
      // we know title & shortname exist because we enforce it in the constructor when using --printable
      frontCover.append(this.doc.querySelector('h1.title') ?? '');
      frontCover.append(this.doc.querySelector('h1.shortname') ?? '');
      wrapper.before(frontCover);

      // inside cover
      const insideCover = document.createElement('div');

      insideCover.classList.add('full-page-svg');
      insideCover.setAttribute('id', 'inside-cover');

      frontCover.after(insideCover);
    }

    let commonEles: HTMLElement[] = [];
    let tocJs = '';
    if (this.opts.toc) {
      this.log('Building table of contents...');

      if (this.opts.printable) {
        // Ecma guidance directs three levels of clause in ToC
        new Toc(this).build(3);
      } else {
        ({ js: tocJs, eles: commonEles } = makeMenu(this));
      }
    }

    if (this.opts.printable) {
      this.log('Applying tweaks for printable document...');
      // The logo is present in ecma-262. We could consider removing it from the document instead of having this tweak.
      const logo = document.getElementById('ecma-logo');
      if (logo) {
        if (logo.parentElement && logo.parentElement.tagName === 'P') {
          logo.parentElement.remove();
        } else {
          logo.remove();
        }
      }

      this.doc
        .querySelector('#spec-container > emu-clause:first-of-type')
        ?.before(this.doc.querySelector('h1.title')!.cloneNode(true));
    } else {
      // apparently including this confuses Prince, even when it's `display: none`
      this.log('Building shortcuts help dialog...');
      commonEles.push(this.buildShortcutsHelp());
    }

    for (const ele of commonEles) {
      this.doc.body.insertBefore(ele, this.doc.body.firstChild);
    }

    const jsContents =
      (await concatJs(sdoJs, tocJs)) + `\n;let usesMultipage = ${!!this.opts.multipage}`;
    const jsSha = sha(jsContents);

    await this.buildAssets(jsContents, jsSha);

    if (this.opts.multipage) {
      await this.buildMultipage(wrapper, commonEles);
    }

    const file = this.opts.multipage
      ? path.join(this.opts.outfile!, 'index.html')
      : this.opts.outfile ?? null;
    this.generatedFiles.set(file, this.toHTML());

    return this;
  }

  private labelClauses() {
    const label = (clause: Clause) => {
      if (clause.header != null) {
        if (
          clause.signature?.return?.kind === 'completion' &&
          clause.signature.return.completionType !== 'normal'
        ) {
          // style="border: 1px #B50000; background-color: #FFE6E6; padding: .2rem;border-radius: 5px;/*! color: white; */font-size: small;vertical-align: middle;/*! line-height: 1em; */border-style: dotted;color: #B50000;cursor: default;user-select: none;"
          // TODO: make this a different color
          clause.header.innerHTML += `<span class="clause-tag abrupt-tag" title="this can return an abrupt completion">abrupt</span>`;
        }
        // TODO: make this look like the [UC] annotation
        // TODO: hide this if [UC] is not enabled (maybe)
        // the querySelector is gross; you are welcome to replace it with a better analysis which actually keeps track of stuff
        if (clause.node.querySelector('.e-user-code')) {
          clause.header.innerHTML += `<span class="clause-tag user-code-tag" title="this can invoke user code">user code</span>`;
        }
      }
      for (const sub of clause.subclauses) {
        label(sub);
      }
    };
    for (const sub of this.subclauses) {
      label(sub);
    }
  }

  // checks that AOs which do/don't return completion records are invoked appropriately
  // also checks that the appropriate number of arguments are passed

  private toHTML() {
    const htmlEle = this.doc.documentElement;
    return '<!doctype html>\n' + (htmlEle.hasAttributes() ? htmlEle.outerHTML : htmlEle.innerHTML);
  }

  /** @internal */
  public locate(
    node: Element | Node,
  ): ({ file?: string; source: string } & ElementLocation) | undefined {
    let pointer: Element | Node | null = node;
    let dom: JSDOM;
    let file: string | undefined;
    let source: string | undefined;
    search: {
      while (pointer != null) {
        if (this.topLevelImportedNodes.has(pointer)) {
          const importNode = this.topLevelImportedNodes.get(pointer)!;
          dom = importNode.dom;
          file = importNode.importPath;
          source = importNode.source;
          break search;
        }
        pointer = pointer.parentElement;
      }
      // else
      dom = this.dom;
    }
    const loc = dom.nodeLocation(node);
    if (loc) {
      // we can't just spread `loc` because not all properties are own/enumerable
      const out: ReturnType<Spec['locate']> = {
        source: this.sourceText,
        startTag: loc.startTag,
        endTag: loc.endTag,
        startOffset: loc.startOffset,
        endOffset: loc.endOffset,
        attrs: loc.attrs,
        startLine: loc.startLine,
        startCol: loc.startCol,
        endLine: loc.endLine,
        endCol: loc.endCol,
      };
      if (pointer != null) {
        out.file = file!;
        out.source = source!;
      }
      return out;
    }
  }

  private buildReferenceGraph() {
    const refToClause = this.refsByClause;
    const setParent = (node: Element) => {
      let pointer: Node | null = node;
      while (pointer && !['EMU-CLAUSE', 'EMU-INTRO', 'EMU-ANNEX'].includes(pointer.nodeName)) {
        pointer = pointer.parentNode;
      }
      // @ts-ignore
      if (pointer == null || pointer.id == null) {
        // @ts-ignore
        pointer = { id: 'sec-intro' };
      }
      // @ts-ignore
      if (refToClause[pointer.id] == null) {
        // @ts-ignore
        refToClause[pointer.id] = [];
      }
      // @ts-ignore
      refToClause[pointer.id].push(node.id);
    };

    let counter = 0;
    this._xrefs.forEach(xref => {
      let entry = xref.entry;
      if (!entry || entry.namespace === 'external') return;

      if (!entry.id && entry.refId) {
        entry = this.spec.biblio.byId(entry.refId);
      }

      if (!xref.id) {
        const id = `_ref_${counter++}`;
        xref.node.setAttribute('id', id);
        xref.id = id;
      }
      setParent(xref.node);

      entry.referencingIds.push(xref.id);
    });

    this._ntRefs.forEach(prod => {
      const entry = prod.entry;
      if (!entry || entry.namespace === 'external') return;

      // if this is the defining nt of an emu-production, don't create a ref
      if (prod.node.parentNode!.nodeName === 'EMU-PRODUCTION') return;

      const id = `_ref_${counter++}`;
      prod.node.setAttribute('id', id);
      setParent(prod.node);

      entry.referencingIds.push(id);
    });
  }

  private readSectionId(ele: Element) {
    if (ele.id == null) {
      this.warn({
        type: 'node',
        ruleId: 'top-level-section-id',
        message: 'When using --multipage, top-level sections must have ids',
        node: ele,
      });
      return undefined;
    }
    if (!ele.id.startsWith('sec-')) {
      this.warn({
        type: 'node',
        ruleId: 'top-level-section-id',
        message: 'When using --multipage, top-level sections must have ids beginning with `sec-`',
        node: ele,
      });
      return undefined;
    }
    const name = ele.id.substring(4);
    if (!/^[A-Za-z0-9-_]+$/.test(name)) {
      this.warn({
        type: 'node',
        ruleId: 'top-level-section-id',
        message:
          'When using --multipage, top-level sections must have ids matching /^[A-Za-z0-9-_]+$/',
        node: ele,
      });
      return undefined;
    }
    if (name.toLowerCase() === 'index') {
      this.warn({
        type: 'node',
        ruleId: 'top-level-section-id',
        message: 'When using --multipage, top-level sections must not be named "index"',
        node: ele,
      });
      return undefined;
    }
    return name;
  }

  private propagateEffects() {
    for (const [effectName, worklist] of this._effectWorklist) {
      this.propagateEffect(effectName, worklist);
    }
  }

  private propagateEffect(effectName: string, worklist: WorklistItem[]) {
    const usersOfAoid: Map<string, Set<Clause>> = new Map();
    for (const xref of this._xrefs) {
      if (xref.clause == null || xref.aoid == null) continue;
      if (!xref.shouldPropagateEffect(effectName)) continue;

      if (xref.hasAddedEffect(effectName)) {
        maybeAddClauseToEffectWorklist(effectName, xref.clause, worklist);
      }

      const usedAoid = xref.aoid;
      if (!usersOfAoid.has(usedAoid)) {
        usersOfAoid.set(usedAoid, new Set());
      }
      usersOfAoid.get(usedAoid)!.add(xref.clause);
    }

    while (worklist.length !== 0) {
      const clause = worklist.shift()!;
      const aoid = clause.aoid;
      if (aoid == null || !usersOfAoid.has(aoid)) {
        continue;
      }

      this._effectfulAOs.set(aoid, clause.effects);
      for (const userClause of usersOfAoid.get(aoid)!) {
        maybeAddClauseToEffectWorklist(effectName, userClause, worklist);
      }
    }
  }

  /** @internal */
  public getEffectsByAoid(aoid: string): string[] | null {
    if (this._effectfulAOs.has(aoid)) {
      return this._effectfulAOs.get(aoid)!;
    }
    return null;
  }

  private annotateExternalLinks(): void {
    for (const a of this.doc.querySelectorAll('a')) {
      if (a.hostname !== '' && a.href !== a.textContent && a.protocol !== 'mailto:') {
        a.setAttribute('data-print-href', '');
      }
    }
  }

  private async buildMultipage(wrapper: Element, commonEles: Element[]) {
    let stillIntro = true;
    const introEles = [];
    const sections: { name: string; eles: Element[] }[] = [];
    const containedIdToSection: Map<string, string> = new Map();
    const sectionToContainedIds: Map<string, string[]> = new Map();
    const clauseTypes = ['EMU-ANNEX', 'EMU-CLAUSE'];
    // @ts-ignore
    for (const child of wrapper.children) {
      let section: { name: string; eles: Element[] };
      if (stillIntro) {
        if (clauseTypes.includes(child.nodeName)) {
          throw new Error('cannot make multipage build without intro');
        } else if (child.nodeName !== 'EMU-INTRO') {
          // anything before emu-intro is considered part of the introduction
          introEles.push(child);
          continue;
        }

        stillIntro = false;

        if (child.id !== 'sec-intro') {
          this.warn({
            type: 'node',
            ruleId: 'top-level-section-id',
            message: 'When using --multipage, the introduction must have id "sec-intro"',
            node: child,
          });
          continue;
        }

        const name = 'index';
        introEles.push(child);
        section = { name, eles: introEles };
      } else {
        if (!clauseTypes.includes(child.nodeName)) {
          throw new Error('non-clause children are not yet implemented: ' + child.nodeName);
        }

        const name = this.readSectionId(child);
        if (name === undefined) {
          continue;
        }

        section = { name, eles: [child] };
      }

      sections.push(section);

      const contained: string[] = [];
      sectionToContainedIds.set(section.name, contained);
      for (const ele of section.eles) {
        if (ele.id) {
          contained.push(ele.id);
          containedIdToSection.set(ele.id, section.name);
        }
        for (const item of ele.querySelectorAll('[id]')) {
          contained.push(item.id);
          containedIdToSection.set(item.id, section.name);
        }
      }
    }

    let htmlEle = '';
    if (this.doc.documentElement.hasAttributes()) {
      const clonedHtmlEle = this.doc.documentElement.cloneNode(false) as HTMLElement;
      clonedHtmlEle.innerHTML = '';
      const src = clonedHtmlEle.outerHTML;
      htmlEle = src.substring(0, src.length - '<head></head><body></body></html>'.length);
    }

    const head = this.doc.head.cloneNode(true) as HTMLHeadElement;

    const containedMap = JSON.stringify(Object.fromEntries(sectionToContainedIds)).replace(
      /[\\`$]/g,
      '\\$&',
    );
    if (this.assets.type !== 'none') {
      const multipageJsContents = `'use strict';
let multipageMap = JSON.parse(\`${containedMap}\`);
${await utils.readFile(path.join(__dirname, '../js/multipage.js'))}
`;

      // assets are never internal for multipage builds
      // @ts-expect-error
      const multipageLocationOnDisk = path.join(this.assets.directory, 'js', 'multipage.js');

      this.generatedFiles.set(multipageLocationOnDisk, multipageJsContents);

      // the path will be rewritten below
      // so it should initially be relative to outfile, not outfile/multipage
      const multipageScript = this.doc.createElement('script');
      multipageScript.src =
        path.relative(this.opts.outfile!, multipageLocationOnDisk) +
        '?cache=' +
        sha(multipageJsContents);
      multipageScript.setAttribute('defer', '');
      head.insertBefore(multipageScript, head.querySelector('script'));
    }

    for (const { name, eles } of sections) {
      this.log(`Generating section ${name}...`);
      const headClone = head.cloneNode(true) as HTMLHeadElement;
      const commonClone = commonEles.map(e => e.cloneNode(true));
      const clones = eles.map(e => e.cloneNode(true));
      const allClones = [headClone, ...commonClone, ...clones] as Element[];
      for (const anchor of allClones.flatMap(e => [...e.querySelectorAll('a')])) {
        if (linkIsAbsolute(anchor)) {
          continue;
        }
        if (linkIsInternal(anchor)) {
          let p = anchor.hash.substring(1);
          if (!containedIdToSection.has(p)) {
            try {
              p = decodeURIComponent(p);
            } catch {
              // pass
            }
            if (!containedIdToSection.has(p)) {
              this.warn({
                type: 'node',
                ruleId: 'multipage-link-target',
                message: 'could not find appropriate section for ' + anchor.hash,
                node: anchor,
              });
              continue;
            }
          }
          const targetSec = containedIdToSection.get(p)!;
          anchor.href = (targetSec === 'index' ? './' : targetSec + '.html') + anchor.hash;
        } else if (linkIsPathRelative(anchor)) {
          anchor.href = path.relative('multipage', pathFromRelativeLink(anchor));
        }
      }

      for (const link of allClones.flatMap(e => [...e.querySelectorAll('link')])) {
        if (!linkIsAbsolute(link) && linkIsPathRelative(link)) {
          link.href = path.relative('multipage', pathFromRelativeLink(link));
        }
      }

      for (const img of allClones.flatMap(e => [...e.querySelectorAll('img')])) {
        if (!/^(http:|https:|:|\/)/.test(img.src)) {
          img.src = path.relative('multipage', img.src);
        }
      }

      for (const script of allClones.flatMap(e => [...e.querySelectorAll('script')])) {
        if (script.hasAttribute('src') && !/^(http:|https:|:|\/)/.test(script.src)) {
          script.src = path.relative('multipage', script.src);
        }
      }

      // prettier-ignore
      for (const object of allClones.flatMap(e => [...e.querySelectorAll('object[data]')]) as HTMLObjectElement[]) {
        if (!/^(http:|https:|:|\/)/.test(object.data)) {
          object.data = path.relative('multipage', object.data);
        }
      }

      if (eles[0].hasAttribute('id')) {
        const canonical = this.doc.createElement('link');
        canonical.setAttribute('rel', 'canonical');
        canonical.setAttribute('href', `../#${eles[0].id}`);
        headClone.appendChild(canonical);
      }

      // @ts-expect-error
      const commonHTML = commonClone.map(e => e.outerHTML).join('\n');
      // @ts-expect-error
      const clonesHTML = clones.map(e => e.outerHTML).join('\n');
      const content = `<!doctype html>${htmlEle}\n${headClone.outerHTML}\n<body>${commonHTML}<div id='spec-container'>${clonesHTML}</div></body>`;

      this.generatedFiles.set(path.join(this.opts.outfile!, `multipage/${name}.html`), content);
    }
  }

  private async buildAssets(jsContents: string, jsSha: string) {
    if (this.assets.type === 'none') return;
    this.log('Building assets...');

    // check for very old manual 'ecmarkup.js'/'ecmarkup.css'
    const oldEles = this.doc.querySelectorAll(
      "script[src='ecmarkup.js'],link[href='ecmarkup.css']",
    );
    for (const item of oldEles) {
      this.warn({
        type: 'attr',
        ruleId: 'old-script-or-style',
        node: item,
        attr: item.tagName === 'SCRIPT' ? 'src' : 'href',
        message:
          'ecmarkup will insert its own js/css; the input document should not include tags for them',
      });
    }

    const FONT_FILE_CONTENTS = new Map(
      zip(
        FONT_FILES.values(),
        await Promise.all(
          Array.from(FONT_FILES.values()).map(fontFile =>
            utils.readBinaryFile(path.join(__dirname, '..', 'fonts', fontFile)),
          ),
        ),
      ),
    );

    const IMG_FILE_CONTENTS = new Map(
      zip(
        IMG_FILES.values(),
        await Promise.all(
          Array.from(IMG_FILES.values()).map(imgFile =>
            utils.readBinaryFile(path.join(__dirname, '..', 'img', imgFile)),
          ),
        ),
      ),
    );

    const [cssContents, printCssContents] = (
      await Promise.all(
        ['../css/elements.css', '../css/print.css'].map(f =>
          utils.readFile(path.join(__dirname, f)),
        ),
      )
    ).map(css =>
      css
        .replace(
          /^([ \t]*)src: +local\(([^)]+)\), +local\(([^)]+)\);$/gm,
          (match, indent, displayName, postScriptName) => {
            const fontFile = FONT_FILES.get(postScriptName) ?? FONT_FILES.get(displayName);
            if (fontFile == null) {
              throw new Error(`Unrecognised font: ${JSON.stringify(postScriptName)}`);
            }
            const fontType = path.extname(fontFile).slice(1);
            const urlRef =
              this.assets.type === 'inline'
                ? `data:font/${fontType};base64,${FONT_FILE_CONTENTS.get(fontFile)!.toString('base64')}`
                : `../fonts/${fontFile}`;
            return `${indent}src: local(${displayName}), local(${postScriptName}), url(${urlRef}) format('${fontType}');`;
          },
        )
        .replace(/^([ \t]*)content: +url\(img\/([^)]+)\);$/gm, (match, indent, url) => {
          if (!IMG_FILES.has(url)) {
            throw new Error(`Unrecognised image: ${JSON.stringify(url)}`);
          }
          const imageType = path.extname(url).slice(1);
          const urlRef =
            this.assets.type === 'inline'
              ? `data:image/${imageType};base64,${IMG_FILE_CONTENTS.get(url)!.toString('base64')}`
              : `../img/${url}`;
          return `${indent}content: url(${urlRef});`;
        }),
    );

    if (this.assets.type === 'external') {
      const outDir = this.opts.outfile
        ? this.opts.multipage
          ? this.opts.outfile
          : path.dirname(this.opts.outfile)
        : process.cwd();

      const scriptLocationOnDisk = path.join(this.assets.directory, 'js', 'ecmarkup.js');
      const styleLocationOnDisk = path.join(this.assets.directory, 'css', 'ecmarkup.css');
      const printStyleLocationOnDisk = path.join(this.assets.directory, 'css', 'print.css');

      this.generatedFiles.set(scriptLocationOnDisk, jsContents);
      this.generatedFiles.set(styleLocationOnDisk, cssContents);
      this.generatedFiles.set(printStyleLocationOnDisk, printCssContents);
      for (const [, fontFile] of FONT_FILES) {
        this.generatedFiles.set(
          path.join(this.assets.directory, 'fonts', fontFile),
          FONT_FILE_CONTENTS.get(fontFile)!,
        );
      }
      for (const imgFile of IMG_FILES) {
        this.generatedFiles.set(
          path.join(this.assets.directory, 'img', imgFile),
          IMG_FILE_CONTENTS.get(imgFile)!,
        );
      }

      const script = this.doc.createElement('script');
      script.src = path.relative(outDir, scriptLocationOnDisk) + '?cache=' + jsSha;
      script.setAttribute('defer', '');
      this.doc.head.appendChild(script);

      this.addStyle(this.doc.head, path.relative(outDir, printStyleLocationOnDisk), 'print');
      this.addStyle(this.doc.head, path.relative(outDir, styleLocationOnDisk));
    } else {
      // i.e. assets.type === 'inline'
      this.log('Inlining JavaScript assets...');
      const script = this.doc.createElement('script');
      script.textContent = jsContents;
      this.doc.head.appendChild(script);

      this.log('Inlining CSS assets...');
      const style = this.doc.createElement('style');
      style.textContent = cssContents;
      this.doc.head.appendChild(style);
      const printStyle = this.doc.createElement('style');
      if (this.opts.printable) {
        printStyle.textContent = printCssContents;
      } else {
        printStyle.textContent = `@media print {\n${printCssContents}\n}`;
      }
      this.doc.head.appendChild(printStyle);
    }
    const currentYearStyle = this.doc.createElement('style');
    currentYearStyle.textContent = `
    @media print {
      @page :left {
        @bottom-right {
          content: '© Ecma International ${this.opts.date!.getFullYear()}';
        }
      }
      @page :right {
        @bottom-left {
          content: '© Ecma International ${this.opts.date!.getFullYear()}';
        }
      }
      @page :first {
        @bottom-left {
          content: '';
        }
        @bottom-right {
          content: '';
        }
      }
      @page :blank {
        @bottom-left {
          content: '';
        }
        @bottom-right {
          content: '';
        }
      }
    }
    `;
    this.doc.head.appendChild(currentYearStyle);
    const solarizedStyle = this.doc.createElement('style');
    solarizedStyle.textContent = `
      @import url("https://cdnjs.cloudflare.com/ajax/libs/highlight.js/${
        (hljs as any).versionString
      }/styles/base16/solarized-light.min.css");
      @import url("https://cdnjs.cloudflare.com/ajax/libs/highlight.js/${
        (hljs as any).versionString
      }/styles/a11y-dark.min.css") (prefers-color-scheme: dark);
    `;
    this.doc.head.appendChild(solarizedStyle);
  }

  private addStyle(head: HTMLHeadElement, href: string, media?: 'all' | 'print' | 'screen') {
    const style = this.doc.createElement('link');
    style.setAttribute('rel', 'stylesheet');
    style.setAttribute('href', href);
    if (media != null) {
      style.setAttribute('media', media);
    }

    // insert early so that the document's own stylesheets can override
    const firstLink = head.querySelector('link[rel=stylesheet], style');
    if (firstLink != null) {
      head.insertBefore(style, firstLink);
    } else {
      head.appendChild(style);
    }
  }

  private buildSpecWrapper() {
    const elements = this.doc.body.childNodes;
    const wrapper = this.doc.createElement('div');
    wrapper.id = 'spec-container';

    while (elements.length > 0) {
      wrapper.appendChild(elements[0]);
    }

    this.doc.body.appendChild(wrapper);

    return wrapper;
  }

  private buildShortcutsHelp() {
    const shortcutsHelp = this.doc.createElement('div');
    shortcutsHelp.setAttribute('id', 'shortcuts-help');
    shortcutsHelp.innerHTML = `
<ul>
  <li><span>Toggle shortcuts help</span><code>?</code></li>
  <li><span>Toggle "can call user code" annotations</span><code>u</code></li>
${this.opts.multipage ? `<li><span>Navigate to/from multipage</span><code>m</code></li>` : ''}
  <li><span>Jump to search box</span><code>/</code></li>
  <li><span>Toggle pinning of the current clause</span><code>p</code></li>
  <li><span>Jump to the <i>n</i><sup>th</sup> pin</span><code>1-9</code></li>
  <li><span>Jump to the 10<sup>th</sup> pin</span><code>0</code></li>
  <li><span>Jump to the most recent link target</span><code>\`</code></li>
</ul>`;
    return shortcutsHelp;
  }

  private processMetadata() {
    const block = this.doc.querySelector('pre.metadata');

    if (!block || !block.parentNode) {
      return;
    }

    let data: any;
    try {
      data = yaml.safeLoad(block.textContent!);
    } catch (e: any) {
      if (typeof e?.mark.line === 'number' && typeof e?.mark.column === 'number') {
        this.warn({
          type: 'contents',
          ruleId: 'invalid-metadata',
          message: `metadata block failed to parse: ${e.reason}`,
          node: block,
          nodeRelativeLine: e.mark.line + 1,
          nodeRelativeColumn: e.mark.column + 1,
        });
      } else {
        this.warn({
          type: 'node',
          ruleId: 'invalid-metadata',
          message: 'metadata block failed to parse',
          node: block,
        });
      }
      return;
    } finally {
      block.parentNode.removeChild(block);
    }

    Object.assign(this.opts, data);
  }

  private async loadBiblios() {
    this.cancellationToken.throwIfCancellationRequested();
    const biblioPaths = [];
    for (const biblioEle of this.doc.querySelectorAll('emu-biblio')) {
      const href = biblioEle.getAttribute('href');
      biblioEle.remove();
      if (href == null) {
        this.spec.warn({
          type: 'node',
          node: biblioEle,
          ruleId: 'biblio-href',
          message: 'emu-biblio elements must have an href attribute',
        });
      } else {
        biblioPaths.push(href);
      }
    }
    const biblioContents = await Promise.all(
      biblioPaths.map(p => this.fetch(path.join(this.rootDir, p))),
    );
    const biblios = biblioContents.flatMap(c => JSON.parse(c) as ExportedBiblio | ExportedBiblio[]);
    for (const biblio of biblios.concat(this.opts.extraBiblios ?? [])) {
      if (biblio?.entries == null) {
        let message = Object.keys(biblio ?? {}).some(k => k.startsWith('http'))
          ? 'This is an old-style biblio.'
          : 'Biblio does not appear to be in the correct format, are you using an old-style biblio?';
        message += ' You will need to update it to work with versions of ecmarkup >= 12.0.0.';
        throw new Error(message);
      }
      this.biblio.addExternalBiblio(biblio);
      for (const entry of biblio.entries) {
        if (entry.type === 'op' && entry.effects?.length > 0) {
          this._effectfulAOs.set(entry.aoid, entry.effects);
          for (const effect of entry.effects) {
            if (!this._effectWorklist.has(effect)) {
              this._effectWorklist.set(effect, []);
            }
            this._effectWorklist.get(effect)!.push(entry);
          }
        }
      }
    }
  }

  private async loadImports() {
    const imports = this.doc.body.querySelectorAll('emu-import');
    for (let i = 0; i < imports.length; i++) {
      await buildImports(this, imports[i] as EmuImportElement, this.rootDir);
    }

    // we've already removed biblio elements in the main document in loadBiblios
    // so any which are here now were in an import, which is illegal
    for (const biblioEle of this.doc.querySelectorAll('emu-biblio')) {
      this.warn({
        type: 'node',
        node: biblioEle,
        ruleId: 'biblio-in-import',
        message: 'emu-biblio elements cannot be used within emu-imports',
      });
    }
  }

  public exportBiblio(): ExportedBiblio | null {
    if (!this.opts.location) {
      this.warn({
        type: 'global',
        ruleId: 'no-location',
        message:
          "no spec location specified; biblio not generated. try setting the location in the document's metadata block",
      });
      return null;
    }

    return this.biblio.export();
  }

  private highlightCode() {
    this.log('Highlighting syntax...');
    const codes = this.doc.querySelectorAll('pre code');
    for (let i = 0; i < codes.length; i++) {
      const classAttr = codes[i].getAttribute('class');
      if (!classAttr) continue;

      const language = classAttr.replace(/lang(uage)?-/, '');
      let input = codes[i].textContent!;

      // remove leading and trailing blank lines
      input = input.replace(/^(\s*[\r\n])+|([\r\n]\s*)+$/g, '');

      // remove base inden based on indent of first non-blank line
      const baseIndent = input.match(/^\s*/) || '';
      const baseIndentRe = new RegExp('^' + baseIndent, 'gm');
      input = input.replace(baseIndentRe, '');

      // @ts-expect-error the type definitions for highlight.js are broken
      const result = hljs.highlight(input, { language });
      codes[i].innerHTML = result.value;
      codes[i].setAttribute('class', classAttr + ' hljs');
    }
  }

  private buildBoilerplate() {
    this.cancellationToken.throwIfCancellationRequested();
    const status = this.opts.status!;
    const version = this.opts.version;
    const title = this.opts.title;
    const shortname = this.opts.shortname;
    const location = this.opts.location;
    const stage = this.opts.stage;

    if (this.opts.copyright) {
      if (status !== 'draft' && status !== 'standard' && !this.opts.contributors) {
        this.warn({
          type: 'global',
          ruleId: 'no-contributors',
          message:
            'contributors not specified, skipping copyright boilerplate. specify contributors in your frontmatter metadata',
        });
      } else {
        // copyright goes near the front of the printed document, instead of the last annex
        if (this.opts.printable) {
          const intro = this.doc.querySelector('emu-intro');
          if (!intro) {
            throw new Error('--printable requires an emu-intro');
          }
          const copyrightClause = this.buildCopyrightBoilerplate();
          intro.after(copyrightClause);
        }

        const licenseClause = this.buildLicenseBoilerplate();
        let last: HTMLElement | undefined;
        utils.domWalkBackward(this.doc.body, node => {
          if (last) return false;
          if (node.nodeName === 'EMU-CLAUSE' || node.nodeName === 'EMU-ANNEX') {
            last = node as HTMLElement;
            return false;
          }
        });

        if (last && last.parentNode) {
          last.parentNode.insertBefore(licenseClause, last.nextSibling);
        } else {
          this.doc.body.appendChild(licenseClause);
        }
      }
    }

    // title
    if (title && !this._updateBySelector('title', title)) {
      const titleElem = this.doc.createElement('title');
      titleElem.innerHTML = utils.textContentFromHTML(this.doc, title);
      this.doc.head.appendChild(titleElem);
    }

    if (title && !this._updateBySelector('h1.title', title)) {
      const h1 = this.doc.createElement('h1');
      h1.setAttribute('class', 'title');
      h1.innerHTML = title;
      this.doc.body.insertBefore(h1, this.doc.body.firstChild);
    }

    // version string, e.g. "6th Edition July 2016" or "Draft 10 / September 26, 2015"
    let versionText = '';
    let omitShortname = false;
    if (version) {
      versionText += version + ' / ';
    } else if (status === 'proposal' && stage) {
      versionText += 'Stage ' + stage + ' Draft / ';
    } else if (status === 'draft' && shortname) {
      if (this.opts.printable) {
        versionText += 'Draft / ';
      } else {
        versionText += 'Draft ' + shortname + ' / ';
        omitShortname = true;
      }
    } else {
      return;
    }

    const defaultDateFormat = status === 'standard' ? STANDARD_DATE_FORMAT : DRAFT_DATE_FORMAT;
    versionText += new Intl.DateTimeFormat('en-US', defaultDateFormat).format(this.opts.date);

    if (!this._updateBySelector('h1.version', versionText)) {
      const h1 = this.doc.createElement('h1');
      h1.setAttribute('class', 'version');
      h1.innerHTML = versionText;
      this.doc.body.insertBefore(h1, this.doc.body.firstChild);
    }
    if (this.opts.printable) {
      this.doc.querySelector('h1.version')!.setAttribute(
        'data-year',
        new Intl.DateTimeFormat('en-US', {
          year: 'numeric',
          timeZone: 'UTC',
        }).format(this.opts.date),
      );
    }

    // shortname and status, like 'Draft ECMA-262'
    if (shortname && !omitShortname) {
      // for proposals, link shortname to location
      const shortnameLinkHtml =
        status === 'proposal' && location ? `<a href="${location}">${shortname}</a>` : shortname;
      const shortnameHtml =
        (this.opts.printable && status === 'standard'
          ? ''
          : `<span class="status">${status.charAt(0).toUpperCase() + status.slice(1)}</span> `) +
        shortnameLinkHtml;

      if (!this._updateBySelector('h1.shortname', shortnameHtml)) {
        const h1 = this.doc.createElement('h1');
        h1.setAttribute('class', 'shortname');
        h1.innerHTML = shortnameHtml;
        this.doc.body.insertBefore(h1, this.doc.body.firstChild);
      }
    }

    // opengraph tags
    const metas = [...this.doc.querySelectorAll('meta')];
    const insertMetaTag =
      metas.length === 0
        ? (node: HTMLMetaElement) => this.doc.head.prepend(node)
        : (node: HTMLMetaElement) => metas[metas.length - 1].after(node);
    if (!metas.some(n => n.getAttribute('property') === 'og:description')) {
      const description = (
        this.opts.description ??
        (this.doc.querySelector('emu-intro') ?? this.doc.querySelector('emu-clause'))?.textContent
      )
        ?.slice(0, 300)
        .trim();
      if (description) {
        const meta = this.doc.createElement('meta');
        meta.setAttribute('property', 'og:description');
        meta.setAttribute('content', description);
        insertMetaTag(meta);
      }
    }
    if (!metas.some(n => n.getAttribute('property') === 'og:title')) {
      const title = this.opts.title
        ? utils.textContentFromHTML(this.doc, this.opts.title)
        : this.doc.querySelector('title')?.textContent;
      if (title) {
        const meta = this.doc.createElement('meta');
        meta.setAttribute('property', 'og:title');
        meta.setAttribute('content', title);
        insertMetaTag(meta);
      }
    }
    if (!metas.some(n => n.getAttribute('property') === 'og:image')) {
      const meta = this.doc.createElement('meta');
      meta.setAttribute('property', 'og:image');
      meta.setAttribute('content', 'https://tc39.es/ecmarkup/ecma-logo.png');
      insertMetaTag(meta);
    }
  }

  private buildCopyrightBoilerplate() {
    let copyrightFile: string | undefined;

    if (this.opts.boilerplate) {
      if (this.opts.boilerplate.copyright == 'alternative') {
        copyrightFile = 'alternative-copyright';
      } else if (this.opts.boilerplate.copyright) {
        copyrightFile = path.join(process.cwd(), this.opts.boilerplate.copyright);
      }
    }

    // Ecma documents should exclusively have either the standard copyright or the alternative copyright.
    // Proposals are not Ecma documents.
    let copyright = getBoilerplate(
      copyrightFile || `${this.opts.status !== 'proposal' ? 'standard' : 'proposal'}-copyright`,
    );
    const copyrightElement = this.doc.createElement('div');

    copyrightElement.classList.add('copyright-notice');
    copyrightElement.id = 'copyright-notice';

    if (this.opts.contributors) {
      copyright = copyright.replace('!CONTRIBUTORS!', this.opts.contributors);
    }

    copyright = copyright
      .replace('!YEAR!', '' + this.opts.date!.getFullYear())
      .replace('!DOCUMENT!', `${this.opts.title} ${this.opts.location}`);

    if (this.opts.printable) {
      copyrightElement.innerHTML = copyright;
    } else {
      copyrightElement.innerHTML = `<h2>Copyright Notice</h2>
${copyright}`;
    }

    return copyrightElement;
  }

  private buildLicenseBoilerplate() {
    let addressFile: string | undefined;
    let licenseFile: string | undefined;

    if (this.opts.boilerplate) {
      if (this.opts.boilerplate.address) {
        addressFile = path.join(process.cwd(), this.opts.boilerplate.address);
      }
      if (this.opts.boilerplate.license) {
        licenseFile = path.join(process.cwd(), this.opts.boilerplate.license);
      }
    }

    // Get content from files
    let address = getBoilerplate(addressFile || 'address');
    const license = getBoilerplate(licenseFile || 'software-license');

    if (this.opts.status === 'proposal') {
      address = '';
    }

    let licenseClause = this.doc.querySelector('.copyright-and-software-license');

    if (!licenseClause) {
      licenseClause = this.doc.createElement('emu-annex');
      licenseClause.setAttribute('id', 'sec-copyright-and-software-license');
    } else if (this.opts.printable) {
      throw new Error(
        'ecmarkup currently generates its own copyright for printed documents; if you need this open an issue',
      );
    }

    licenseClause.setAttribute('back-matter', '');

    // Printed document has "Software license" as last section, web version has "Copyright and Software license"
    if (this.opts.printable) {
      licenseClause.innerHTML = `
      <h1>Software License</h1>
      ${address}
      ${license}
      `;
    } else {
      licenseClause.innerHTML = `
        <h1>Copyright &amp; Software License</h1>
        ${address}
        ${this.buildCopyrightBoilerplate().outerHTML}
        <h2>Software License</h2>
        ${license}
      `;
    }

    return licenseClause;
  }

  private generateSDOMap() {
    const sdoMap = Object.create(null);

    this.log('Building SDO map...');

    const mainGrammar: Set<Element> = new Set(
      this.doc.querySelectorAll('emu-grammar[type=definition]:not([example])'),
    );

    // we can't just do `:not(emu-annex emu-grammar)` because that selector is too complicated for this version of jsdom
    for (const annexEle of this.doc.querySelectorAll('emu-annex emu-grammar[type=definition]')) {
      mainGrammar.delete(annexEle);
    }

    const mainProductions: Map<string, { rhs: RightHandSide | OneOfList; rhsEle: Element }[]> =
      new Map();

    for (const grammarEle of mainGrammar) {
      if (!('grammarSource' in grammarEle)) {
        // this should only happen if it failed to parse/emit, which we'll have already warned for
        continue;
      }
      for (const [name, { rhses }] of this.getProductions(grammarEle as AugmentedGrammarEle)) {
        if (mainProductions.has(name)) {
          mainProductions.set(name, mainProductions.get(name)!.concat(rhses));
        } else {
          mainProductions.set(name, rhses);
        }
      }
    }

    const sdos = this.doc.querySelectorAll(
      'emu-clause[type=sdo],emu-clause[type="syntax-directed operation"]',
    );
    outer: for (const sdo of sdos) {
      let header: Element | undefined;
      for (const child of sdo.children) {
        if (child.tagName === 'SPAN' && child.childNodes.length === 0) {
          // an `oldid` marker, presumably
          continue;
        }
        if (child.tagName === 'H1') {
          header = child;
          break;
        }
        this.warn({
          type: 'node',
          node: child,
          ruleId: 'sdo-name',
          message: 'expected H1 as first child of syntax-directed operation',
        });
        continue outer;
      }
      if (!header) {
        continue;
      }

      const clause = header.firstElementChild!.textContent!;
      const nameMatch = header.textContent
        ?.slice(clause.length + 1)
        .match(/^(?:(?:Static|Runtime) Semantics: )?\s*(\w+)\b/);
      if (nameMatch == null) {
        this.warn({
          type: 'contents',
          node: header,
          ruleId: 'sdo-name',
          message: 'could not parse name of syntax-directed operation',
          nodeRelativeLine: 1,
          nodeRelativeColumn: 1,
        });
        continue;
      }
      const sdoName = nameMatch[1];
      for (const grammarEle of sdo.children) {
        if (grammarEle.tagName !== 'EMU-GRAMMAR') {
          continue;
        }
        if (!('grammarSource' in grammarEle)) {
          // this should only happen if it failed to parse/emit, which we'll have already warned for
          continue;
        }

        // prettier-ignore
        for (const [name, { production, rhses }] of this.getProductions(grammarEle as AugmentedGrammarEle)) {
          if (!mainProductions.has(name)) {
            if (this.biblio.byProductionName(name) != null) {
              // in an ideal world we'd keep the full grammar in the biblio so we could check for a matching RHS, not just a matching LHS
              // but, we're not in that world
              // https://github.com/tc39/ecmarkup/issues/431
              continue;
            }
            const { line, column } = getLocationInGrammarFile(
              (grammarEle as AugmentedGrammarEle).grammarSource,
              production.pos
            );
            this.warn({
              type: 'contents',
              node: grammarEle,
              nodeRelativeLine: line,
              nodeRelativeColumn: column,
              ruleId: 'grammar-shape',
              message: `could not find definition corresponding to production ${name}`,
            });
            continue;
          }

          const mainRhses = mainProductions.get(name)!;
          for (const { rhs, rhsEle } of rhses) {
            const matches = mainRhses.filter(p => rhsMatches(rhs, p.rhs));
            if (matches.length === 0) {
              const { line, column } = getLocationInGrammarFile(
                (grammarEle as AugmentedGrammarEle).grammarSource,
                rhs.pos
              );
              this.warn({
                type: 'contents',
                node: grammarEle,
                nodeRelativeLine: line,
                nodeRelativeColumn: column,
                ruleId: 'grammar-shape',
                message: `could not find definition for rhs ${JSON.stringify(rhsEle.textContent)}`,
              });
              continue;
            }
            if (matches.length > 1) {
              const { line, column } = getLocationInGrammarFile(
                (grammarEle as AugmentedGrammarEle).grammarSource,
                rhs.pos
              );
              this.warn({
                type: 'contents',
                node: grammarEle,
                nodeRelativeLine: line,
                nodeRelativeColumn: column,
                ruleId: 'grammar-shape',
                message: `found multiple definitions for rhs ${JSON.stringify(rhsEle.textContent)}`,
              });
              continue;
            }
            const match = matches[0].rhsEle;
            if (match.id === '') {
              match.id = 'prod-' + sha(`${name} : ${match.textContent}`);
            }
            const mainId = match.id;
            if (rhsEle.id === '') {
              rhsEle.id = 'prod-' + sha(`[${sdoName}] ${name} ${rhsEle.textContent}`);
            }
            if (!{}.hasOwnProperty.call(sdoMap, mainId)) {
              sdoMap[mainId] = Object.create(null);
            }
            const sdosForThisId = sdoMap[mainId];
            if (!{}.hasOwnProperty.call(sdosForThisId, sdoName)) {
              sdosForThisId[sdoName] = { clause, ids: [] };
            } else if (sdosForThisId[sdoName].clause !== clause) {
              this.warn({
                type: 'node',
                node: grammarEle,
                ruleId: 'grammar-shape',
                message: `SDO ${sdoName} found in multiple clauses`,
              });
            }
            sdosForThisId[sdoName].ids.push(rhsEle.id);
          }
        }
      }
    }

    const json = JSON.stringify(sdoMap);
    return `let sdoMap = JSON.parse(\`${json.replace(/[\\`$]/g, '\\$&')}\`);`;
  }

  private getProductions(grammarEle: AugmentedGrammarEle) {
    // unfortunately we need both the element and the grammarkdown node
    // there is no immediate association between them
    // so we are going to reconstruct the association by hand
    const productions: Map<
      string,
      { production: GMDProduction; rhses: { rhs: RightHandSide | OneOfList; rhsEle: Element }[] }
    > = new Map();

    const productionEles: Map<string, Array<Element>> = new Map();
    for (const productionEle of grammarEle.querySelectorAll('emu-production')) {
      if (!productionEle.hasAttribute('name')) {
        // I don't think this is possible, but we can at least be graceful about it
        this.warn({
          type: 'node',
          // All of these elements are synthetic, and hence lack locations, so we point error messages to the containing emu-grammar
          node: grammarEle,
          ruleId: 'grammar-shape',
          message: 'expected emu-production node to have name',
        });
        continue;
      }
      const name = productionEle.getAttribute('name')!;
      const rhses = [...productionEle.querySelectorAll('emu-rhs')];
      if (productionEles.has(name)) {
        productionEles.set(name, productionEles.get(name)!.concat(rhses));
      } else {
        productionEles.set(name, rhses);
      }
    }

    const sourceFile: SourceFile = grammarEle.grammarSource;

    for (const [name, { production, rhses }] of getProductions([sourceFile])) {
      if (!productionEles.has(name)) {
        this.warn({
          type: 'node',
          node: grammarEle,
          ruleId: 'rhs-consistency',
          message: `failed to locate element for production ${name}. This is is a bug in ecmarkup; please report it.`,
        });
        continue;
      }
      const rhsEles = productionEles.get(name)!;
      if (rhsEles.length !== rhses.length) {
        this.warn({
          type: 'node',
          node: grammarEle,
          ruleId: 'rhs-consistency',
          message: `inconsistent RHS lengths for production ${name}. This is is a bug in ecmarkup; please report it.`,
        });
        continue;
      }
      productions.set(name, {
        production,
        rhses: rhses.map((rhs, i) => ({ rhs, rhsEle: rhsEles[i] })),
      });
    }
    return productions;
  }

  private setReplacementAlgorithmOffsets() {
    this.log('Finding offsets for replacement algorithm steps...');
    const pending: Map<string, Element[]> = new Map();

    const setReplacementAlgorithmStart = (element: Element, stepNumbers: number[]) => {
      const rootList = element.firstElementChild! as HTMLOListElement;
      rootList.start = stepNumbers[stepNumbers.length - 1];
      if (stepNumbers.length > 1) {
        // Note the off-by-one here: a length of 1 indicates we are replacing a top-level step, which means we do not need to adjust the styling.
        if (stepNumbers.length === 2) {
          rootList.classList.add('nested-once');
        } else if (stepNumbers.length === 3) {
          rootList.classList.add('nested-twice');
        } else if (stepNumbers.length === 4) {
          rootList.classList.add('nested-thrice');
        } else if (stepNumbers.length === 5) {
          rootList.classList.add('nested-four-times');
        } else {
          // At the sixth level and deeper (so once we have nested five times) we use a consistent line numbering style, so no further cases are necessary
          rootList.classList.add('nested-lots');
        }
      }

      // Fix up the biblio entries for any labeled steps in the algorithm
      for (const entry of this.replacementAlgorithmToContainedLabeledStepEntries.get(element)!) {
        entry.stepNumbers = [...stepNumbers, ...entry.stepNumbers.slice(1)];
        this.labeledStepsToBeRectified.delete(entry.id);

        // Now that we've figured out where the step is, we can deal with algorithms replacing it
        if (pending.has(entry.id)) {
          const todo = pending.get(entry.id)!;
          pending.delete(entry.id);
          for (const replacementAlgorithm of todo) {
            setReplacementAlgorithmStart(replacementAlgorithm, entry.stepNumbers);
          }
        }
      }
    };

    for (const { element, target } of this.replacementAlgorithms) {
      if (this.labeledStepsToBeRectified.has(target)) {
        if (!pending.has(target)) {
          pending.set(target, []);
        }
        pending.get(target)!.push(element);
      } else {
        // When the target is not itself within a replacement, or is within a replacement which we have already rectified, we can just use its step number directly
        const targetEntry = this.biblio.byId(target);
        if (targetEntry == null) {
          this.warn({
            type: 'attr-value',
            attr: 'replaces-step',
            ruleId: 'invalid-replacement',
            message: `could not find step ${JSON.stringify(target)}`,
            node: element,
          });
        } else if (targetEntry.type !== 'step') {
          this.warn({
            type: 'attr-value',
            attr: 'replaces-step',
            ruleId: 'invalid-replacement',
            message: `expected algorithm to replace a step, not a ${targetEntry.type}`,
            node: element,
          });
        } else {
          setReplacementAlgorithmStart(element, targetEntry.stepNumbers);
        }
      }
    }
    if (pending.size > 0) {
      // todo consider line/column missing cases
      this.warn({
        type: 'global',
        ruleId: 'invalid-replacement',
        message:
          'could not unambiguously determine replacement algorithm offsets - do you have a cycle in your replacement algorithms?',
      });
    }
  }

  /** @internal */
  public autolink() {
    this.log('Autolinking terms and abstract ops...');
    const namespaces = Object.keys(this._textNodes);
    for (let i = 0; i < namespaces.length; i++) {
      const namespace = namespaces[i];
      const { replacer, autolinkmap } = replacerForNamespace(namespace, this.biblio);
      const nodes = this._textNodes[namespace];

      for (let j = 0; j < nodes.length; j++) {
        const { node, clause, inAlg, currentId } = nodes[j];
        autolink(node, replacer, autolinkmap, clause, currentId, inAlg);
      }
    }
  }

  /** @internal */
  public setMetaCharset() {
    let current = this.spec.doc.querySelector('meta[charset]');

    if (!current) {
      current = this.spec.doc.createElement('meta');
      this.spec.doc.head.insertBefore(current, this.spec.doc.head.firstChild);
    }

    current.setAttribute('charset', 'utf-8');
  }

  /** @internal */
  public setMetaViewport() {
    if (!this.spec.doc.querySelector('meta[name=viewport]')) {
      const metaViewport = this.spec.doc.createElement('meta');
      metaViewport.setAttribute('name', 'viewport');
      metaViewport.setAttribute('content', 'width=device-width, initial-scale=1');
      this.spec.doc.head.insertBefore(metaViewport, this.spec.doc.head.firstChild);
    }
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
}

function getBoilerplate(file: string) {
  let boilerplateFile: string = file;

  try {
    if (fs.lstatSync(file).isFile()) {
      boilerplateFile = file;
    }
  } catch {
    boilerplateFile = path.join(__dirname, '../boilerplate', `${file}.html`);
  }

  return fs.readFileSync(boilerplateFile, 'utf8');
}

async function walk(walker: TreeWalker, context: Context) {
  const previousInNoAutolink = context.inNoAutolink;
  let previousInNoEmd = context.inNoEmd;
  const { spec } = context;

  context.node = walker.currentNode as HTMLElement;
  context.tagStack.push(context.node);

  if (context.node === context.followingEmd) {
    context.followingEmd = null;
    context.inNoEmd = false;
    // inNoEmd is true because we're walking past the output of emd, rather than by being within a NO_EMD context
    // so reset previousInNoEmd so we exit it properly
    previousInNoEmd = false;
  }

  if (context.node.nodeType === 3 /* Node.TEXT_NODE */) {
    if (context.node.textContent!.trim().length === 0) return; // skip empty nodes; nothing to do!

    const clause = context.clauseStack[context.clauseStack.length - 1] || context.spec;
    const namespace = clause ? clause.namespace : context.spec.namespace;
    if (!context.inNoEmd) {
      // new nodes as a result of emd processing should be skipped
      context.inNoEmd = true;
      let node = context.node as Node | null;
      function nextRealSibling(node: Node | null) {
        while (node?.nextSibling?.nodeType === 8 /* Node.COMMENT_NODE */) {
          node = node.nextSibling;
        }
        return node?.nextSibling;
      }
      while (node && !nextRealSibling(node)) {
        node = node.parentNode;
      }

      if (node) {
        // inNoEmd will be set to false when we walk to this node
        context.followingEmd = nextRealSibling(node)!;
      }
      // else, there's no more nodes to process and inNoEmd does not need to be tracked

      utils.emdTextNode(context.spec, context.node as unknown as Text, namespace);
    }

    if (!context.inNoAutolink) {
      // stuff the text nodes into an array for auto-linking with later
      // (since we can't autolink at this point without knowing the biblio).
      context.spec._textNodes[namespace] = context.spec._textNodes[namespace] || [];
      context.spec._textNodes[namespace].push({
        node: context.node,
        clause,
        inAlg: context.inAlg,
        currentId: context.currentId,
      });
    }
    return;
  }

  // context.node is an HTMLElement (node type 1)

  // handle oldids
  const oldids = context.node.getAttribute('oldids');
  if (oldids) {
    if (!context.node.childNodes) {
      throw new Error('oldids found on unsupported element: ' + context.node.nodeName);
    }
    oldids
      .split(',')
      .map(s => s.trim())
      .forEach(oid => {
        const s = spec.doc.createElement('span');
        s.setAttribute('id', oid);
        context.node.insertBefore(s, context.node.childNodes[0]);
      });
  }

  const parentId = context.currentId;
  if (context.node.hasAttribute('id')) {
    context.currentId = context.node.getAttribute('id');
  }

  if (NO_CLAUSE_AUTOLINK.has(context.node.nodeName)) {
    context.inNoAutolink = true;
  } else if (YES_CLAUSE_AUTOLINK.has(context.node.nodeName)) {
    context.inNoAutolink = false;
  }

  if (NO_EMD.has(context.node.nodeName)) {
    context.inNoEmd = true;
  } else if (YES_EMD.has(context.node.nodeName)) {
    context.inNoEmd = false;
  }

  const visitor = visitorMap[context.node.nodeName];
  if (visitor) {
    await visitor.enter(context);
  }

  const firstChild = walker.firstChild();
  if (firstChild) {
    while (true) {
      await walk(walker, context);
      const next = walker.nextSibling();
      if (!next) break;
    }
    walker.parentNode();
    context.node = walker.currentNode as HTMLElement;
  }

  if (visitor) visitor.exit(context);
  context.inNoAutolink = previousInNoAutolink;
  context.inNoEmd = previousInNoEmd;
  context.currentId = parentId;
  context.tagStack.pop();
}

const jsDependencies = ['sdoMap.js', 'menu.js', 'listNumbers.js', 'superscripts.js'];
async function concatJs(...extras: string[]) {
  let dependencies = await Promise.all(
    jsDependencies.map(dependency => utils.readFile(path.join(__dirname, '../js/' + dependency))),
  );
  dependencies = dependencies.concat(extras);
  return dependencies.join('\n');
}

function sha(str: string) {
  return crypto
    .createHash('sha256')
    .update(str)
    .digest('base64')
    .slice(0, 8)
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

// jsdom does not handle the `.hostname` (etc) parts correctly, so we have to look at the href directly
// it also (some?) relative links as links to about:blank, for the purposes of testing the href
function linkIsAbsolute(link: HTMLAnchorElement | HTMLLinkElement | HTMLScriptElement) {
  const href = getHref(link);
  return !href.startsWith('about:blank') && /^[a-z]+:/.test(href);
}

function linkIsInternal(link: HTMLAnchorElement | HTMLLinkElement | HTMLScriptElement) {
  const href = getHref(link);
  return href.startsWith('#') || href.startsWith('about:blank#');
}

function linkIsPathRelative(link: HTMLAnchorElement | HTMLLinkElement | HTMLScriptElement) {
  const href = getHref(link);
  return !href.startsWith('/') && !href.startsWith('about:blank/');
}

function pathFromRelativeLink(link: HTMLAnchorElement | HTMLLinkElement | HTMLScriptElement) {
  const href = getHref(link);
  return href.startsWith('about:blank') ? href.substring(11) : href;
}

function getHref(link: HTMLAnchorElement | HTMLLinkElement | HTMLScriptElement): string {
  if (isScriptNode(link)) {
    return link.src;
  } else {
    return link.href;
  }
}

function isScriptNode(
  node: HTMLAnchorElement | HTMLLinkElement | HTMLScriptElement,
): node is HTMLScriptElement {
  return node.nodeName.toLowerCase() === 'script';
}
