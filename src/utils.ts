import type { ElementLocation } from 'parse5';

import type Spec from './Spec';

import * as jsdom from 'jsdom';
import * as chalk from 'chalk';
import * as emd from 'ecmarkdown';
import * as fs from 'fs';
import * as path from 'path';
import { collectNonterminalsFromEmd } from './lint/utils';

export function warnEmdFailure(
  report: Spec['warn'],
  node: Element | Text,
  e: SyntaxError & { line?: number; column?: number },
) {
  if (typeof e.line === 'number' && typeof e.column === 'number') {
    report({
      type: 'contents',
      ruleId: 'invalid-emd',
      message: `ecmarkdown failed to parse: ${e.message}`,
      node,
      nodeRelativeLine: e.line,
      nodeRelativeColumn: e.column,
    });
  } else {
    report({
      type: 'node',
      ruleId: 'invalid-emd',
      message: `ecmarkdown failed to parse: ${e.message}`,
      node,
    });
  }
}

export function wrapEmdFailure(src: string) {
  return `#### ECMARKDOWN PARSE FAILED ####<pre>${src}</pre>`;
}

/** @internal */
export function emdTextNode(spec: Spec, node: Text, namespace: string) {
  const loc = spec.locate(node);
  let c;
  if (loc?.endTag == null) {
    c = node.textContent!.replace(/</g, '&lt;');
  } else {
    const start = loc.startTag.endOffset;
    const end = loc.endTag.startOffset;
    c = loc.source.slice(start, end);
  }

  let processed;
  try {
    const parts = emd.parseFragment(c);
    if (spec.opts.lintSpec && loc != null) {
      const nonterminals = collectNonterminalsFromEmd(parts).map(({ name, loc }) => ({
        name,
        loc,
        node,
        namespace,
      }));
      spec._ntStringRefs = spec._ntStringRefs.concat(nonterminals);
    }
    processed = emd.emit(parts);
  } catch (e) {
    warnEmdFailure(spec.warn, node, e as SyntaxError & { line?: number; column?: number });
    processed = wrapEmdFailure(c);
  }

  const template = spec.doc.createElement('template');
  template.innerHTML = processed;

  replaceTextNode(node, template.content);
}

/** @internal */
export function htmlToDom(html: string) {
  const virtualConsole = new jsdom.VirtualConsole();
  virtualConsole.on('error', () => {
    // Suppress warnings from e.g. CSS features not supported by JSDOM
  });
  return new jsdom.JSDOM(html, { includeNodeLocations: true, virtualConsole });
}

/** @internal */
export function textContentFromHTML(doc: Document, html: string) {
  const ele = doc.createElement('span');
  ele.innerHTML = html;
  return ele.textContent!;
}

/** @internal */
export function domWalkBackward(root: Node, cb: (node: Element) => boolean | undefined) {
  const childNodes = root.childNodes;
  const childLen = childNodes.length;

  for (let i = childLen - 1; i >= 0; i--) {
    const node = childNodes[i];
    if (node.nodeType !== 1) continue;

    const cont = cb(node as Element);
    if (cont === false) continue;

    domWalkBackward(node, cb);
  }
}

/** @internal */
export function replaceTextNode(node: Node, frag: DocumentFragment) {
  // Append all the nodes
  const parent = node.parentNode;
  if (!parent) return [];

  const newXrefNodes = Array.from(frag.querySelectorAll('emu-xref'));
  const first = frag.childNodes[0];

  if (first.nodeType === 3) {
    node.textContent = first.textContent;
    frag.removeChild(first);
  } else {
    // set it to empty because we don't want to break iteration
    // (I think it should work to delete it... investigate possible jsdom bug)
    node.textContent = '';
  }

  parent.insertBefore(frag, node.nextSibling);

  return newXrefNodes;
}

/** @internal */
export function traverseWhile<P extends string, T extends Record<P, T | null>>(
  node: T | null,
  relationship: P,
  predicate: (node: T) => boolean,
  options?: { once?: boolean },
): T | null {
  const once = options?.once ?? false;
  while (node != null && predicate(node)) {
    node = node[relationship];
    if (once) break;
  }
  return node;
}

/** @internal */
export function logVerbose(str: string) {
  const dateString = new Date().toISOString();
  console.error(chalk.gray('[' + dateString + '] ') + str);
}

/** @internal */
export function logWarning(str: string) {
  const dateString = new Date().toISOString();
  console.error(chalk.gray('[' + dateString + '] ') + chalk.red(str));
}

const CLAUSE_LIKE = ['EMU-ANNEX', 'EMU-CLAUSE', 'EMU-INTRO', 'EMU-NOTE', 'BODY'];
/** @internal */
export function shouldInline(node: Node) {
  const surrogateParentTags = ['EMU-GRAMMAR', 'EMU-IMPORT', 'INS', 'DEL'];
  const parent = traverseWhile(node.parentNode, 'parentNode', node =>
    surrogateParentTags.includes(node?.nodeName ?? ''),
  );
  if (!parent) return false;

  const clauseLikeParent =
    CLAUSE_LIKE.includes(parent.nodeName) ||
    CLAUSE_LIKE.includes((parent as Element).getAttribute('data-simulate-tagname')?.toUpperCase()!);
  return !clauseLikeParent;
}

/** @internal */
export function readFile(file: string) {
  return new Promise<string>((resolve, reject) => {
    fs.readFile(file, 'utf8', (err, data) => (err ? reject(err) : resolve(data)));
  });
}

/** @internal */
export function readBinaryFile(file: string) {
  return new Promise<Buffer>((resolve, reject) => {
    fs.readFile(file, (err, data) => (err ? reject(err) : resolve(data)));
  });
}

/** @internal */
export function writeFile(file: string, content: string | Buffer) {
  return new Promise<void>((resolve, reject) => {
    // we could do this async, but it's not worth worrying about
    fs.mkdirSync(path.dirname(file), { recursive: true });

    if (typeof content === 'string') {
      content = Buffer.from(content, 'utf8');
    }

    fs.writeFile(file, content, err => (err ? reject(err) : resolve()));
  });
}

/** @internal */
export async function copyFile(src: string, dest: string) {
  const content = await readFile(src);
  await writeFile(dest, content);
}

export function offsetToLineAndColumn(string: string, offset: number) {
  const lines = string.split('\n');
  let line = 0;
  let seen = 0;
  while (true) {
    if (line >= lines.length) {
      throw new Error(`offset ${offset} exceeded string ${JSON.stringify(string)}`);
    }
    if (seen + lines[line].length >= offset) {
      break;
    }
    seen += lines[line].length + 1; // +1 for the '\n'
    ++line;
  }
  const column = offset - seen;
  return { line: line + 1, column: column + 1 };
}

export function attrLocation(source: string | undefined, loc: ElementLocation, attr: string) {
  const attrLoc = loc.startTag.attrs?.[attr];
  if (attrLoc == null) {
    return { line: loc.startTag.startLine, column: loc.startTag.startCol };
  } else {
    return { line: attrLoc.startLine, column: attrLoc.startCol };
  }
}

export function attrValueLocation(source: string | undefined, loc: ElementLocation, attr: string) {
  const attrLoc = loc.startTag.attrs?.[attr];
  if (attrLoc == null || source == null) {
    return { line: loc.startTag.startLine, column: loc.startTag.startCol };
  } else {
    const tagText = source.slice(attrLoc.startOffset, attrLoc.endOffset);
    // RegExp.escape when
    const matcher = new RegExp(attr.replace(/[/\\^$*+?.()|[\]{}]/g, '\\$&') + '="?', 'i');
    return {
      line: attrLoc.startLine,
      column: attrLoc.startCol + (tagText.match(matcher)?.[0].length ?? 0),
    };
  }
}

const KNOWN_EFFECTS = ['user-code'];
export function validateEffects(spec: Spec, effectsRaw: string[], node: Element) {
  const effects = [];
  const unknownEffects = [];

  for (const e of effectsRaw) {
    if (KNOWN_EFFECTS.indexOf(e) !== -1) {
      effects.push(e);
    } else {
      unknownEffects.push(e);
    }
  }

  if (unknownEffects.length !== 0) {
    spec.warn({
      type: 'node',
      ruleId: 'unknown-effects',
      message: `unknown effects: ${unknownEffects}`,
      node,
    });
  }

  return effects;
}

export function doesEffectPropagateToParent(node: Element, effect: string) {
  // Effects should not propagate past explicit fences in parent steps.
  //
  // Abstract Closures are considered automatic fences for the user-code
  // effect, since those are effectively nested functions.
  //
  // Calls to Abstract Closures that can call user code must be explicitly
  // marked as such with <emu-meta effects="user-code">...</emu-meta>.
  for (; node.parentElement; node = node.parentElement) {
    const parent = node.parentElement;
    // This is super hacky. It's checking the output of ecmarkdown.
    if (parent.tagName !== 'LI') continue;

    if (
      effect === 'user-code' &&
      /be a new (\w+ )*Abstract Closure/.test(parent.textContent ?? '')
    ) {
      return false;
    }

    if (
      parent
        .getAttribute('fence-effects')
        ?.split(',')
        .map(s => s.trim())
        .includes(effect)
    ) {
      return false;
    }
  }
  return true;
}

export function* zip<A, B>(
  as: Iterable<A>,
  bs: Iterable<B>,
  allowMismatchedLengths = false,
): Iterable<[A, B]> {
  const iterA = as[Symbol.iterator]();
  const iterB = bs[Symbol.iterator]();

  while (true) {
    const iterResultA = iterA.next();
    const iterResultB = iterB.next();

    if (iterResultA.done !== iterResultB.done) {
      if (allowMismatchedLengths) {
        if (iterResultA.done) {
          iterB.return?.();
        } else {
          iterA.return?.();
        }
        break;
      }
      throw new Error('zipping iterators which ended at different times');
    }

    if (iterResultA.done) {
      break;
    }

    yield [iterResultA.value, iterResultB.value];
  }
}

const pr = new Intl.PluralRules('en', { type: 'ordinal' });

export function withOrdinalSuffix(n: number): string {
  const rule = pr.select(n);
  const suffixes = { one: 'st', two: 'nd', few: 'rd', other: 'th' };
  return `${n}${suffixes[rule as keyof typeof suffixes]}`;
}
