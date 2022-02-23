import type { ElementLocation } from 'parse5';
import type { EcmarkupError, Options } from './ecmarkup';
import type { Context } from './Context';
import type { AlgorithmBiblioEntry, BiblioData, StepBiblioEntry, Type } from './Biblio';
import type { BuilderInterface } from './Builder';

import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import * as yaml from 'js-yaml';
import * as utils from './utils';
import * as hljs from 'highlight.js';
// Builders
import Import, { EmuImportElement } from './Import';
import Clause from './Clause';
import ClauseNumbers from './clauseNums';
import Algorithm from './Algorithm';
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
import type { OrderedListItemNode, parseAlgorithm, UnorderedListItemNode } from 'ecmarkdown';

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
const NO_EMD = new Set(['PRE', 'CODE', 'EMU-PRODUCTION', 'EMU-ALG', 'EMU-GRAMMAR', 'EMU-EQN']);
const YES_EMD = new Set(['EMU-GMOD']); // these are processed even if they are nested in NO_EMD contexts

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

// NOTE: This is the public API for spec as used in the types. Do not remove.
export default interface Spec {
  spec: this;
  opts: Options;
  rootPath: string;
  rootDir: string;
  namespace: string;
  exportBiblio(): any;
  generatedFiles: Map<string | null, string>;
}

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

function isEmuImportElement(node: Node): node is EmuImportElement {
  return node.nodeType === 1 && node.nodeName === 'EMU-IMPORT';
}

export function maybeAddClauseToEffectWorklist(
  effectName: string,
  clause: Clause,
  worklist: Clause[]
) {
  if (
    !worklist.includes(clause) &&
    clause.canHaveEffect(effectName) &&
    !clause.effects.includes(effectName)
  ) {
    clause.effects.push(effectName);
    worklist.push(clause);
  }
}

/*@internal*/
export default class Spec {
  spec: this;
  opts: Options;
  rootPath: string;
  rootDir: string;
  sourceText: string;
  namespace: string;
  biblio: Biblio;
  dom: JSDOM;
  doc: Document;
  imports: Import[];
  node: HTMLElement;
  nodeIds: Set<string>;
  subclauses: Clause[];
  replacementAlgorithmToContainedLabeledStepEntries: Map<Element, StepBiblioEntry[]>; // map from re to its labeled nodes
  labeledStepsToBeRectified: Set<string>;
  replacementAlgorithms: { element: Element; target: string }[];
  cancellationToken: CancellationToken;
  generatedFiles: Map<string | null, string>;
  log: (msg: string) => void;
  warn: (err: Warning) => void | undefined;

  _figureCounts: { [type: string]: number };
  _xrefs: Xref[];
  _ntRefs: NonTerminal[];
  _ntStringRefs: {
    name: string;
    loc: { line: number; column: number };
    node: Element | Text;
    namespace: string;
  }[];
  _prodRefs: ProdRef[];
  _textNodes: { [s: string]: [TextNodeContext] };
  _effectWorklist: Map<string, Clause[]>;
  _effectfulAOs: Map<string, Clause>;
  _emuMetasToRender: Set<HTMLElement>;
  _emuMetasToRemove: Set<HTMLElement>;
  refsByClause: { [refId: string]: [string] };

  private _fetch: (file: string, token: CancellationToken) => PromiseLike<string>;

  constructor(
    rootPath: string,
    fetch: (file: string, token: CancellationToken) => PromiseLike<string>,
    dom: JSDOM,
    opts: Options,
    sourceText: string,
    token = CancellationToken.none
  ) {
    opts = opts || {};

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
    this.warn = opts.warn ? wrapWarn(sourceText, this, opts.warn) : () => {};
    this._figureCounts = {
      table: 0,
      figure: 0,
    };
    this._xrefs = [];
    this._ntRefs = [];
    this._ntStringRefs = [];
    this._prodRefs = [];
    this._textNodes = {};
    this._effectWorklist = new Map();
    this._effectfulAOs = new Map();
    this._emuMetasToRender = new Set();
    this._emuMetasToRemove = new Set();
    this.refsByClause = Object.create(null);

    this.processMetadata();
    Object.assign(this.opts, opts);

    if (this.opts.multipage) {
      if (this.opts.jsOut || this.opts.cssOut) {
        throw new Error('Cannot use --multipage with --js-out or --css-out');
      }

      if (this.opts.outfile == null) {
        this.opts.outfile = '';
      }

      if (this.opts.assets !== 'none') {
        this.opts.jsOut = path.join(this.opts.outfile, 'ecmarkup.js');
        this.opts.cssOut = path.join(this.opts.outfile, 'ecmarkup.css');
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

  public fetch(file: string) {
    return this._fetch(file, this.cancellationToken);
  }

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

    this.autolink();

    if (this.opts.lintSpec) {
      this.log('Checking types...');
      this.typecheck();
    }
    this.log('Propagating effect annotations...');
    this.propagateEffects();
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
    this.setCharset();
    const wrapper = this.buildSpecWrapper();

    let commonEles: HTMLElement[] = [];
    let tocJs = '';
    if (this.opts.toc) {
      this.log('Building table of contents...');

      if (this.opts.oldToc) {
        new Toc(this).build();
      } else {
        ({ js: tocJs, eles: commonEles } = makeMenu(this));
      }
    }

    this.log('Building shortcuts help dialog...');
    commonEles.push(this.buildShortcutsHelp());

    for (const ele of commonEles) {
      this.doc.body.insertBefore(ele, this.doc.body.firstChild);
    }

    const jsContents =
      (await concatJs(sdoJs, tocJs)) + `\n;let usesMultipage = ${!!this.opts.multipage}`;
    const jsSha = sha(jsContents);

    if (this.opts.multipage) {
      await this.buildMultipage(wrapper, commonEles, jsSha);
    }

    await this.buildAssets(jsContents, jsSha);

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

  // right now this just checks that AOs which do/don't return completion records are invoked appropriately
  // someday, more!
  private typecheck() {
    const isCall = (x: Xref) => x.isInvocation && x.clause != null && x.aoid != null;
    const isUnused = (t: Type) =>
      t.kind === 'unused' ||
      (t.kind === 'completion' &&
        (t.completionType === 'abrupt' || t.typeOfValueIfNormal?.kind === 'unused'));
    const AOs = this.biblio
      .localEntries()
      .filter(e => e.type === 'op' && e.signature?.return != null) as AlgorithmBiblioEntry[];
    const onlyPerformed: Map<string, null | 'only performed' | 'top'> = new Map(
      AOs.filter(e => !isUnused(e.signature!.return!)).map(a => [a.aoid, null])
    );

    const alwaysAssertedToBeNormal: Map<string, null | 'always asserted normal' | 'top'> = new Map(
      AOs.filter(e => e.signature!.return!.kind === 'completion').map(a => [a.aoid, null])
    );

    for (const xref of this._xrefs) {
      if (!isCall(xref)) {
        continue;
      }
      const biblioEntry = this.biblio.byAoid(xref.aoid);
      if (biblioEntry == null) {
        this.warn({
          type: 'node',
          node: xref.node,
          ruleId: 'xref-biblio',
          message: `could not find biblio entry for xref ${JSON.stringify(xref.aoid)}`,
        });
        continue;
      }
      const signature = biblioEntry.signature;
      if (signature == null) {
        continue;
      }

      const { return: returnType } = signature;
      if (returnType == null) {
        continue;
      }

      // this is really gross
      // i am sorry
      // the better approach is to make the xref-linkage logic happen on the level of the ecmarkdown tree
      // so that we still have this information at that point
      // rather than having to reconstruct it, approximately
      // ... someday!
      const warn = (message: string) => {
        const ruleId = 'completion-invocation';

        const path = [];
        let pointer: HTMLElement | null = xref.node;
        let alg;
        while (pointer != null) {
          if (pointer.tagName === 'LI') {
            // @ts-ignore
            path.unshift([].indexOf.call(pointer.parentElement!.children, pointer));
          }
          if (pointer.tagName === 'EMU-ALG') {
            alg = pointer;
            break;
          }
          pointer = pointer.parentElement;
        }
        if (alg == null || !{}.hasOwnProperty.call(alg, 'ecmarkdownTree')) {
          let pointer: Element | null = xref.node;
          while (this.locate(pointer) == null) {
            pointer = pointer.parentElement;
            if (pointer == null) {
              break;
            }
          }
          if (pointer == null) {
            this.warn({
              type: 'global',
              ruleId,
              message: message + ` but I wasn't able to find a source location to give you, sorry!`,
            });
          } else {
            this.warn({
              type: 'node',
              node: pointer,
              ruleId,
              message,
            });
          }
        } else {
          // @ts-ignore
          const tree = alg.ecmarkdownTree as ReturnType<typeof parseAlgorithm>;
          let stepPointer: OrderedListItemNode | UnorderedListItemNode = {
            sublist: tree.contents,
          } as OrderedListItemNode;
          for (const step of path) {
            stepPointer = stepPointer.sublist!.contents[step];
          }
          this.warn({
            type: 'contents',
            node: alg,
            ruleId: 'invocation-return-type',
            message,
            nodeRelativeLine: stepPointer.location.start.line,
            nodeRelativeColumn: stepPointer.location.start.column,
          });
        }
      };

      const consumedAsCompletion = isConsumedAsCompletion(xref);
      // checks elsewhere ensure that well-formed documents never have a union of completion and non-completion, so checking the first child suffices
      // TODO: this is for 'a break completion or a throw completion', which is kind of a silly union; maybe address that in some other way?
      const isCompletion =
        returnType.kind === 'completion' ||
        (returnType.kind === 'union' && returnType.types[0].kind === 'completion');
      if (['Completion', 'ThrowCompletion', 'NormalCompletion'].includes(xref.aoid)) {
        if (consumedAsCompletion) {
          warn(
            `${xref.aoid} clearly creates a Completion Record; it does not need to be marked as such, and it would not be useful to immediately unwrap its result`
          );
        }
      } else if (isCompletion && !consumedAsCompletion) {
        warn(`${xref.aoid} returns a Completion Record, but is not consumed as if it does`);
      } else if (!isCompletion && consumedAsCompletion) {
        warn(`${xref.aoid} does not return a Completion Record, but is consumed as if it does`);
      }
      if (returnType.kind === 'unused' && !isCalledAsPerform(xref, false)) {
        warn(
          `${xref.aoid} does not return a meaningful value and should only be invoked as \`Perform ${xref.aoid}(...).\``
        );
      }

      if (onlyPerformed.has(xref.aoid) && onlyPerformed.get(xref.aoid) !== 'top') {
        const old = onlyPerformed.get(xref.aoid);
        const performed = isCalledAsPerform(xref, true);
        if (!performed) {
          onlyPerformed.set(xref.aoid, 'top');
        } else if (old === null) {
          onlyPerformed.set(xref.aoid, 'only performed');
        }
      }
      if (
        alwaysAssertedToBeNormal.has(xref.aoid) &&
        alwaysAssertedToBeNormal.get(xref.aoid) !== 'top'
      ) {
        const old = alwaysAssertedToBeNormal.get(xref.aoid);
        const asserted = isAssertedToBeNormal(xref);
        if (!asserted) {
          alwaysAssertedToBeNormal.set(xref.aoid, 'top');
        } else if (old === null) {
          alwaysAssertedToBeNormal.set(xref.aoid, 'always asserted normal');
        }
      }
    }

    for (const [aoid, state] of onlyPerformed) {
      if (state !== 'only performed') {
        continue;
      }
      const message = `${aoid} is only ever invoked with Perform, so it should return ~unused~ or a Completion Record which, if normal, contains ~unused~`;
      const ruleId = 'perform-not-unused';
      const biblioEntry = this.biblio.byAoid(aoid)!;
      if (biblioEntry._node) {
        this.spec.warn({
          type: 'node',
          ruleId,
          message,
          node: biblioEntry._node,
        });
      } else {
        this.spec.warn({
          type: 'global',
          ruleId,
          message,
        });
      }
    }

    for (const [aoid, state] of alwaysAssertedToBeNormal) {
      if (state !== 'always asserted normal') {
        continue;
      }
      if (aoid === 'AsyncGeneratorAwaitReturn') {
        // TODO remove this when https://github.com/tc39/ecma262/issues/2412 is fixed
        continue;
      }
      const message = `every call site of ${aoid} asserts the return value is a normal completion; it should be refactored to not return a completion record at all`;
      const ruleId = 'always-asserted-normal';
      const biblioEntry = this.biblio.byAoid(aoid)!;
      if (biblioEntry._node) {
        this.spec.warn({
          type: 'node',
          ruleId,
          message,
          node: biblioEntry._node,
        });
      } else {
        this.spec.warn({
          type: 'global',
          ruleId,
          message,
        });
      }
    }
  }

  private toHTML() {
    const htmlEle = this.doc.documentElement;
    return '<!doctype html>\n' + (htmlEle.hasAttributes() ? htmlEle.outerHTML : htmlEle.innerHTML);
  }

  public locate(
    node: Element | Node
  ): ({ file?: string; source: string } & ElementLocation) | undefined {
    let pointer: Element | Node | null = node;
    while (pointer != null) {
      if (isEmuImportElement(pointer)) {
        break;
      }
      pointer = pointer.parentElement;
    }
    const dom = pointer == null ? this.dom : pointer.dom;
    if (!dom) {
      return;
    }
    // the jsdom types are wrong
    const loc = dom.nodeLocation(node) as unknown as ElementLocation;
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
        out.file = pointer.importPath!;
        out.source = pointer.source!;
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

  private checkValidSectionId(ele: Element) {
    if (!ele.id.startsWith('sec-')) {
      this.warn({
        type: 'node',
        ruleId: 'top-level-section-id',
        message: 'When using --multipage, top-level sections must have ids beginning with `sec-`',
        node: ele,
      });
      return false;
    }
    if (!/^[A-Za-z0-9-_]+$/.test(ele.id)) {
      this.warn({
        type: 'node',
        ruleId: 'top-level-section-id',
        message:
          'When using --multipage, top-level sections must have ids matching /^[A-Za-z0-9-_]+$/',
        node: ele,
      });
      return false;
    }
    if (ele.id.toLowerCase() === 'sec-index') {
      this.warn({
        type: 'node',
        ruleId: 'top-level-section-id',
        message: 'When using --multipage, top-level sections must not be named "index"',
        node: ele,
      });
      return false;
    }
    return true;
  }

  private propagateEffects() {
    for (const [effectName, worklist] of this._effectWorklist) {
      this.propagateEffect(effectName, worklist);
    }
  }

  private propagateEffect(effectName: string, worklist: Clause[]) {
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
      const clause = worklist.shift() as Clause;
      const aoid = clause.aoid;
      if (aoid == null || !usersOfAoid.has(aoid)) {
        continue;
      }

      this._effectfulAOs.set(aoid, clause);
      for (const userClause of usersOfAoid.get(aoid)!) {
        maybeAddClauseToEffectWorklist(effectName, userClause, worklist);
      }
    }
  }

  public getEffectsByAoid(aoid: string): string[] | null {
    if (this._effectfulAOs.has(aoid)) {
      return this._effectfulAOs.get(aoid)!.effects;
    }
    return null;
  }

  private async buildMultipage(wrapper: Element, commonEles: Element[], jsSha: string) {
    let stillIntro = true;
    const introEles = [];
    const sections: { name: string; eles: Element[] }[] = [];
    const containedIdToSection: Map<string, string> = new Map();
    const sectionToContainedIds: Map<string, string[]> = new Map();
    const clauseTypes = ['EMU-ANNEX', 'EMU-CLAUSE'];
    // @ts-ignore
    for (const child of wrapper.children) {
      if (stillIntro) {
        if (clauseTypes.includes(child.nodeName)) {
          throw new Error('cannot make multipage build without intro');
        } else if (child.nodeName === 'EMU-INTRO') {
          stillIntro = false;

          if (child.id == null) {
            this.warn({
              type: 'node',
              ruleId: 'top-level-section-id',
              message: 'When using --multipage, top-level sections must have ids',
              node: child,
            });
            continue;
          }
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
          sections.push({ name, eles: introEles });

          const contained: string[] = [];
          sectionToContainedIds.set(name, contained);

          for (const item of introEles) {
            if (item.id) {
              contained.push(item.id);
              containedIdToSection.set(item.id, name);
            }
          }

          // @ts-ignore
          for (const item of [...introEles].flatMap(e => [...e.querySelectorAll('[id]')])) {
            contained.push(item.id);
            containedIdToSection.set(item.id, name);
          }
        } else {
          introEles.push(child);
        }
      } else {
        if (!clauseTypes.includes(child.nodeName)) {
          throw new Error('non-clause children are not yet implemented: ' + child.nodeName);
        }
        if (child.id == null) {
          this.warn({
            type: 'node',
            ruleId: 'top-level-section-id',
            message: 'When using --multipage, top-level sections must have ids',
            node: child,
          });
          continue;
        }
        if (!this.checkValidSectionId(child)) {
          continue;
        }

        const name = child.id.substring(4);
        const contained: string[] = [];
        sectionToContainedIds.set(name, contained);

        contained.push(child.id);
        containedIdToSection.set(child.id, name);

        for (const item of child.querySelectorAll('[id]')) {
          contained.push(item.id);
          containedIdToSection.set(item.id, name);
        }
        sections.push({ name, eles: [child] });
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
    this.addStyle(head, 'ecmarkup.css'); // omit `../` because we rewrite `<link>` elements below
    this.addStyle(
      head,
      `https://cdnjs.cloudflare.com/ajax/libs/highlight.js/${
        (hljs as any).versionString
      }/styles/base16/solarized-light.min.css`
    );

    const script = this.doc.createElement('script');
    script.src = '../ecmarkup.js?cache=' + jsSha;
    script.setAttribute('defer', '');
    head.appendChild(script);

    const containedMap = JSON.stringify(Object.fromEntries(sectionToContainedIds)).replace(
      /[\\`$]/g,
      '\\$&'
    );
    const multipageJsContents = `'use strict';
let multipageMap = JSON.parse(\`${containedMap}\`);
${await utils.readFile(path.join(__dirname, '../js/multipage.js'))}
`;
    if (this.opts.assets !== 'none') {
      this.generatedFiles.set(
        path.join(this.opts.outfile!, 'multipage/multipage.js'),
        multipageJsContents
      );
    }

    const multipageScript = this.doc.createElement('script');
    multipageScript.src = 'multipage.js?cache=' + sha(multipageJsContents);
    multipageScript.setAttribute('defer', '');
    head.appendChild(multipageScript);

    for (const { name, eles } of sections) {
      this.log(`Generating section ${name}...`);
      const headClone = head.cloneNode(true) as HTMLHeadElement;
      const commonClone = commonEles.map(e => e.cloneNode(true));
      const clones = eles.map(e => e.cloneNode(true));
      const allClones = [headClone, ...commonClone, ...clones];
      // @ts-ignore
      const links = allClones.flatMap(e => [...e.querySelectorAll('a,link')]);
      for (const link of links) {
        if (linkIsAbsolute(link)) {
          continue;
        }
        if (linkIsInternal(link)) {
          let p = link.hash.substring(1);
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
                message: 'could not find appropriate section for ' + link.hash,
                node: link,
              });
              continue;
            }
          }
          const targetSec = containedIdToSection.get(p)!;
          link.href = (targetSec === 'index' ? './' : targetSec + '.html') + link.hash;
        } else if (linkIsPathRelative(link)) {
          link.href = '../' + pathFromRelativeLink(link);
        }
      }
      // @ts-ignore
      for (const img of allClones.flatMap(e => [...e.querySelectorAll('img')])) {
        if (!/^(http:|https:|:|\/)/.test(img.src)) {
          img.src = '../' + img.src;
        }
      }
      // prettier-ignore
      // @ts-ignore
      for (const object of allClones.flatMap(e => [...e.querySelectorAll('object[data]')])) {
        if (!/^(http:|https:|:|\/)/.test(object.data)) {
          object.data = '../' + object.data;
        }
      }

      if (eles[0].hasAttribute('id')) {
        const canonical = this.doc.createElement('link');
        canonical.setAttribute('rel', 'canonical');
        canonical.setAttribute('href', `../#${eles[0].id}`);
        headClone.appendChild(canonical);
      }

      // @ts-ignore
      const commonHTML = commonClone.map(e => e.outerHTML).join('\n');
      // @ts-ignore
      const clonesHTML = clones.map(e => e.outerHTML).join('\n');
      const content = `<!doctype html>${htmlEle}\n${headClone.outerHTML}\n<body>${commonHTML}<div id='spec-container'>${clonesHTML}</div></body>`;

      this.generatedFiles.set(path.join(this.opts.outfile!, `multipage/${name}.html`), content);
    }
  }

  private async buildAssets(jsContents: string, jsSha: string) {
    const cssContents = await utils.readFile(path.join(__dirname, '../css/elements.css'));

    if (this.opts.jsOut) {
      this.generatedFiles.set(this.opts.jsOut, jsContents);
    }

    if (this.opts.cssOut) {
      this.generatedFiles.set(this.opts.cssOut, cssContents);
    }

    if (this.opts.assets === 'none') return;

    const outDir = this.opts.outfile
      ? this.opts.multipage
        ? this.opts.outfile
        : path.dirname(this.opts.outfile)
      : process.cwd();

    if (this.opts.jsOut) {
      let skipJs = false;
      const scripts = this.doc.querySelectorAll('script');
      for (let i = 0; i < scripts.length; i++) {
        const script = scripts[i];
        const src = script.getAttribute('src');
        if (src && path.normalize(path.join(outDir, src)) === path.normalize(this.opts.jsOut)) {
          this.log(`Found existing js link to ${src}, skipping inlining...`);
          skipJs = true;
        }
      }
      if (!skipJs) {
        const script = this.doc.createElement('script');
        script.src = path.relative(outDir, this.opts.jsOut) + '?cache=' + jsSha;
        script.setAttribute('defer', '');
        this.doc.head.appendChild(script);
      }
    } else {
      this.log('Inlining JavaScript assets...');
      const script = this.doc.createElement('script');
      script.textContent = jsContents;
      this.doc.head.appendChild(script);
    }

    if (this.opts.cssOut) {
      let skipCss = false;
      const links = this.doc.querySelectorAll('link[rel=stylesheet]');
      for (let i = 0; i < links.length; i++) {
        const link = links[i];
        const href = link.getAttribute('href');
        if (href && path.normalize(path.join(outDir, href)) === path.normalize(this.opts.cssOut)) {
          this.log(`Found existing css link to ${href}, skipping inlining...`);
          skipCss = true;
        }
      }
      if (!skipCss) {
        this.addStyle(this.doc.head, path.relative(outDir, this.opts.cssOut));
      }
    } else {
      this.log('Inlining CSS assets...');
      const style = this.doc.createElement('style');
      style.textContent = cssContents;
      this.doc.head.appendChild(style);
    }
    this.addStyle(
      this.doc.head,
      `https://cdnjs.cloudflare.com/ajax/libs/highlight.js/${
        (hljs as any).versionString
      }/styles/base16/solarized-light.min.css`
    );
  }

  private addStyle(head: HTMLHeadElement, href: string) {
    const style = this.doc.createElement('link');
    style.setAttribute('rel', 'stylesheet');
    style.setAttribute('href', href);

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
    await Promise.all(
      Array.from(this.doc.querySelectorAll('emu-biblio'), biblio =>
        this.loadBiblio(path.join(this.rootDir, biblio.getAttribute('href')!))
      )
    );
    for (const biblio of this.opts.extraBiblios ?? []) {
      this.biblio.addExternalBiblio(biblio);
    }
  }

  private async loadBiblio(file: string) {
    const contents = await this.fetch(file);
    this.biblio.addExternalBiblio(JSON.parse(contents));
  }

  private async loadImports() {
    await loadImports(this, this.spec.doc.body, this.rootDir);
  }

  public exportBiblio(): any {
    if (!this.opts.location) {
      this.warn({
        type: 'global',
        ruleId: 'no-location',
        message:
          "no spec location specified; biblio not generated. try setting the location in the document's metadata block",
      });
      return {};
    }

    const biblio: BiblioData = {};
    biblio[this.opts.location] = this.biblio.export();

    return biblio;
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
    let omitShortname = false;
    if (version) {
      versionText += version + ' / ';
    } else if (status === 'proposal' && stage) {
      versionText += 'Stage ' + stage + ' Draft / ';
    } else if (shortname && status === 'draft') {
      versionText += 'Draft ' + shortname + ' / ';
      omitShortname = true;
    } else {
      return;
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
    if (shortname && !omitShortname) {
      // for proposals, link shortname to location
      const shortnameLinkHtml =
        status === 'proposal' && location ? `<a href="${location}">${shortname}</a>` : shortname;
      const shortnameHtml =
        status.charAt(0).toUpperCase() + status.slice(1) + ' ' + shortnameLinkHtml;

      if (!this._updateBySelector('h1.shortname', shortnameHtml)) {
        const h1 = this.doc.createElement('h1');
        h1.setAttribute('class', 'shortname');
        h1.innerHTML = shortnameHtml;
        this.doc.body.insertBefore(h1, this.doc.body.firstChild);
      }
    }
  }

  private buildCopyrightBoilerplate() {
    let addressFile: string | undefined;
    let copyrightFile: string | undefined;
    let licenseFile: string | undefined;

    if (this.opts.boilerplate) {
      if (this.opts.boilerplate.address) {
        addressFile = path.join(process.cwd(), this.opts.boilerplate.address);
      }
      if (this.opts.boilerplate.copyright) {
        copyrightFile = path.join(process.cwd(), this.opts.boilerplate.copyright);
      }
      if (this.opts.boilerplate.license) {
        licenseFile = path.join(process.cwd(), this.opts.boilerplate.license);
      }
    }

    // Get content from files
    let address = getBoilerplate(addressFile || 'address');
    let copyright = getBoilerplate(copyrightFile || `${this.opts.status}-copyright`);
    const license = getBoilerplate(licenseFile || 'software-license');

    if (this.opts.status === 'proposal') {
      address = '';
    }

    // Operate on content
    copyright = copyright.replace(/!YEAR!/g, '' + this.opts.date!.getFullYear());

    if (this.opts.contributors) {
      copyright = copyright.replace(/!CONTRIBUTORS!/g, this.opts.contributors);
    }

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

      if (last && last.parentNode) {
        last.parentNode.insertBefore(copyrightClause, last.nextSibling);
      } else {
        this.doc.body.appendChild(copyrightClause);
      }
    }

    copyrightClause.innerHTML = `
      <h1>Copyright &amp; Software License</h1>
      ${address}
      <h2>Copyright Notice</h2>
      ${copyright.replace('!YEAR!', '' + this.opts.date!.getFullYear())}
      <h2>Software License</h2>
      ${license}
    `;
  }

  private generateSDOMap() {
    const sdoMap = Object.create(null);

    this.log('Building SDO map...');

    const mainGrammar: Set<Element> = new Set(
      this.doc.querySelectorAll('emu-grammar[type=definition]:not([example])')
    );

    // we can't just do `:not(emu-annex emu-grammar)` because that selector is too complicated for this version of jsdom
    for (const annexEle of this.doc.querySelectorAll('emu-annex emu-grammar[type=definition]')) {
      mainGrammar.delete(annexEle);
    }

    const productions: Map<String, Array<Element>> = new Map();
    for (const grammar of mainGrammar) {
      for (const production of grammar.querySelectorAll('emu-production')) {
        if (!production.hasAttribute('name')) {
          // I don't think this is possible, but we can at least be graceful about it
          this.warn({
            type: 'node',
            // All of these elements are synthetic, and hence lack locations, so we point error messages to the containing emu-grammar
            node: grammar,
            ruleId: 'grammar-shape',
            message: 'expected emu-production node to have name',
          });
          continue;
        }
        const name = production.getAttribute('name')!;
        if (productions.has(name)) {
          this.warn({
            type: 'node',
            node: grammar,
            ruleId: 'grammar-shape',
            message: `found duplicate definition for production ${name}`,
          });
          continue;
        }
        const rhses: Array<Element> = [...production.querySelectorAll('emu-rhs')];
        productions.set(name, rhses);
      }
    }

    const sdos = this.doc.querySelectorAll(
      'emu-clause[type=sdo],emu-clause[type="syntax-directed operation"]'
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
      for (const grammar of sdo.children) {
        if (grammar.tagName !== 'EMU-GRAMMAR') {
          continue;
        }
        for (const production of grammar.querySelectorAll('emu-production')) {
          if (!production.hasAttribute('name')) {
            // I don't think this is possible, but we can at least be graceful about it
            this.warn({
              type: 'node',
              node: grammar,
              ruleId: 'grammar-shape',
              message: 'expected emu-production node to have name',
            });
            continue;
          }
          const name = production.getAttribute('name')!;
          if (!productions.has(name)) {
            this.warn({
              type: 'node',
              node: grammar,
              ruleId: 'grammar-shape',
              message: `could not find definition corresponding to production ${name}`,
            });
            continue;
          }
          const mainRhses = productions.get(name)!;
          for (const rhs of production.querySelectorAll('emu-rhs')) {
            const matches = mainRhses.filter(r => rhsMatches(rhs, r));
            if (matches.length === 0) {
              this.warn({
                type: 'node',
                node: grammar,
                ruleId: 'grammar-shape',
                message: `could not find definition for rhs ${rhs.textContent}`,
              });
              continue;
            }
            if (matches.length > 1) {
              this.warn({
                type: 'node',
                node: grammar,
                ruleId: 'grammar-shape',
                message: `found multiple definitions for rhs ${rhs.textContent}`,
              });
              continue;
            }
            const match = matches[0];
            if (match.id == '') {
              match.id = 'prod-' + sha(`${name} : ${match.textContent}`);
            }
            const mainId = match.id;
            if (rhs.id == '') {
              rhs.id = 'prod-' + sha(`[${sdoName}] ${name} ${rhs.textContent}`);
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
                node: grammar,
                ruleId: 'grammar-shape',
                message: `SDO ${sdoName} found in multiple clauses`,
              });
            }
            sdosForThisId[sdoName].ids.push(rhs.id);
          }
        }
      }
    }

    const json = JSON.stringify(sdoMap);
    return `let sdoMap = JSON.parse(\`${json.replace(/[\\`$]/g, '\\$&')}\`);`;
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

  public setCharset() {
    let current = this.spec.doc.querySelector('meta[charset]');

    if (!current) {
      current = this.spec.doc.createElement('meta');
      this.spec.doc.head.insertBefore(current, this.spec.doc.head.firstChild);
    }

    current.setAttribute('charset', 'utf-8');
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
  } catch (error) {
    boilerplateFile = path.join(__dirname, '../boilerplate', `${file}.html`);
  }

  return fs.readFileSync(boilerplateFile, 'utf8');
}

async function loadImports(spec: Spec, rootElement: HTMLElement, rootPath: string) {
  const imports = rootElement.querySelectorAll('EMU-IMPORT');
  for (let i = 0; i < imports.length; i++) {
    const node = imports[i];
    const imp = await Import.build(spec, node as EmuImportElement, rootPath);
    await loadImports(spec, node as HTMLElement, imp.relativeRoot);
  }
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

  if (context.node.nodeType === 3) {
    // walked to a text node

    if (context.node.textContent!.trim().length === 0) return; // skip empty nodes; nothing to do!

    const clause = context.clauseStack[context.clauseStack.length - 1] || context.spec;
    const namespace = clause ? clause.namespace : context.spec.namespace;
    if (!context.inNoEmd) {
      // new nodes as a result of emd processing should be skipped
      context.inNoEmd = true;
      let node = context.node as Node | null;
      while (node && !node.nextSibling) {
        node = node.parentNode;
      }

      if (node) {
        // inNoEmd will be set to false when we walk to this node
        context.followingEmd = node.nextSibling;
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
      .split(/,/g)
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

const jsDependencies = ['sdoMap.js', 'menu.js', 'listNumbers.js'];
async function concatJs(...extras: string[]) {
  let dependencies = await Promise.all(
    jsDependencies.map(dependency => utils.readFile(path.join(__dirname, '../js/' + dependency)))
  );
  dependencies = dependencies.concat(extras);
  return dependencies.join('\n');
}

// todo move this to utils maybe
// this is very similar to the identically-named method in lint/utils.ts, but operates on HTML elements rather than grammarkdown nodes
function rhsMatches(aRhs: Element, bRhs: Element) {
  const a = aRhs.firstElementChild;
  const b = bRhs.firstElementChild;
  if (a == null || b == null) {
    throw new Error('RHS must have content');
  }
  return symbolSpanMatches(a, b);
}

function symbolSpanMatches(a: Element | null, b: Element | null): boolean {
  if (a == null || a.textContent === '[empty]') {
    return canBeEmpty(b);
  }

  if (b != null && symbolMatches(a, b)) {
    return symbolSpanMatches(a.nextElementSibling, b.nextElementSibling);
  }

  // sometimes when there is an optional terminal or nonterminal we give distinct implementations for each case, rather than one implementation which represents both
  // which means both `a b c` and `a c` must match `a b? c`
  if (b != null && canSkipSymbol(b)) {
    return symbolSpanMatches(a, b.nextElementSibling);
  }

  return false;
}

function canBeEmpty(b: Element | null): boolean {
  return b == null || (canSkipSymbol(b) && canBeEmpty(b.nextElementSibling));
}

function canSkipSymbol(a: Element): boolean {
  if (a.tagName === 'EMU-NT' && a.hasAttribute('optional')) {
    return true;
  }
  // 'gmod' is prose assertions
  // 'gann' is [empty], [nlth], and lookahead restrictions]
  return ['EMU-CONSTRAINTS', 'EMU-GMOD', 'EMU-GANN'].includes(a.tagName);
}

function symbolMatches(a: Element, b: Element): boolean {
  const aKind = a.tagName.toLowerCase();
  const bKind = b.tagName.toLowerCase();
  if (aKind !== bKind) {
    return false;
  }
  switch (aKind) {
    case 'emu-t': {
      return a.textContent === b.textContent;
    }
    case 'emu-nt': {
      if (a.childNodes.length > 1 || b.childNodes.length > 1) {
        // NonTerminal.build() adds elements to represent parameters and "opt", but that happens after this phase
        throw new Error('emu-nt nodes should not have other contents at this phase');
      }
      return a.textContent === b.textContent;
    }
    case 'emu-gmod':
    case 'emu-gann': {
      return a.textContent === b.textContent;
    }
    default: {
      throw new Error('unimplemented: symbol matches ' + aKind);
    }
  }
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
function linkIsAbsolute(link: HTMLAnchorElement | HTMLLinkElement) {
  return !link.href.startsWith('about:blank') && /^[a-z]+:/.test(link.href);
}

function linkIsInternal(link: HTMLAnchorElement | HTMLLinkElement) {
  return link.href.startsWith('#') || link.href.startsWith('about:blank#');
}

function linkIsPathRelative(link: HTMLAnchorElement | HTMLLinkElement) {
  return !link.href.startsWith('/') && !link.href.startsWith('about:blank/');
}

function pathFromRelativeLink(link: HTMLAnchorElement | HTMLLinkElement) {
  return link.href.startsWith('about:blank') ? link.href.substring(11) : link.href;
}

function isFirstChild(node: Node) {
  const p = node.parentElement!;
  return (
    p.childNodes[0] === node || (p.childNodes[0].textContent === '' && p.childNodes[1] === node)
  );
}

// TODO factor some of this stuff out
function isCalledAsPerform(xref: Xref, allowQuestion: boolean) {
  let node = xref.node;
  if (node.parentElement?.tagName === 'EMU-META' && isFirstChild(node)) {
    node = node.parentElement;
  }
  const previousSibling = node.previousSibling;
  if (previousSibling?.nodeType !== 3 /* TEXT_NODE */) {
    return false;
  }
  return (allowQuestion ? /\bperform ([?!]\s)?$/i : /\bperform $/i).test(
    previousSibling.textContent!
  );
}

function isAssertedToBeNormal(xref: Xref) {
  let node = xref.node;
  if (node.parentElement?.tagName === 'EMU-META' && isFirstChild(node)) {
    node = node.parentElement;
  }
  const previousSibling = node.previousSibling;
  if (previousSibling?.nodeType !== 3 /* TEXT_NODE */) {
    return false;
  }
  return /\s!\s$/.test(previousSibling.textContent!);
}

function isConsumedAsCompletion(xref: Xref) {
  let node = xref.node;
  if (node.parentElement?.tagName === 'EMU-META' && isFirstChild(node)) {
    node = node.parentElement;
  }
  const previousSibling = node.previousSibling;
  if (previousSibling?.nodeType !== 3 /* TEXT_NODE */) {
    return false;
  }
  if (/[!?]\s$/.test(previousSibling.textContent!)) {
    return true;
  }
  if (previousSibling.textContent! === '(') {
    // check for Completion(
    const previousPrevious = previousSibling.previousSibling;
    if (previousPrevious?.textContent === 'Completion') {
      return true;
    }
  }
  return false;
}
