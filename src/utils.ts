import type { MarkupData } from 'parse5';

import type Spec from './Spec';

import * as jsdom from 'jsdom';
import * as chalk from 'chalk';
import * as emd from 'ecmarkdown';
import * as fs from 'fs';

/*@internal*/
export function emdTextNode(spec: Spec, node: Node) {
  let c = node.textContent!.replace(/</g, '&lt;');

  const template = spec.doc.createElement('template');
  template.innerHTML = emd.fragment(c);

  replaceTextNode(node, template.content);
}

/*@internal*/
export function htmlToDom(html: string) {
  return new (jsdom as any).JSDOM(html, { includeNodeLocations: true });
}

/*@internal*/
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

/*@internal*/
export function replaceTextNode(node: Node, frag: DocumentFragment) {
  // Append all the nodes
  const parent = node.parentNode;
  if (!parent) return [];

  const newXrefNodes = Array.from(frag.querySelectorAll('EMU-XREF'));
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

/*@internal*/
export function logVerbose(str: string) {
  let dateString = new Date().toISOString();
  console.error(chalk.gray('[' + dateString + '] ') + str);
}

/*@internal*/
export function logWarning(str: string) {
  let dateString = new Date().toISOString();
  console.error(chalk.gray('[' + dateString + '] ') + chalk.red('Warning: ' + str));
}

/*@internal*/
export function shouldInline(node: Node) {
  let parent = node.parentNode;
  if (!parent) return false;

  while (
    parent &&
    parent.parentNode &&
    (parent.nodeName === 'EMU-GRAMMAR' ||
      parent.nodeName === 'EMU-IMPORT' ||
      parent.nodeName === 'INS' ||
      parent.nodeName === 'DEL')
  ) {
    parent = parent.parentNode;
  }

  return (
    ['EMU-ANNEX', 'EMU-CLAUSE', 'EMU-INTRO', 'EMU-NOTE', 'BODY'].indexOf(parent.nodeName) === -1
  );
}

/*@internal*/
export function readFile(file: string) {
  return new Promise<string>((resolve, reject) => {
    fs.readFile(file, 'utf8', (err, data) => (err ? reject(err) : resolve(data)));
  });
}

/*@internal*/
export function writeFile(file: string, content: string) {
  return new Promise<void>((resolve, reject) => {
    fs.writeFile(file, content, { encoding: 'utf8' }, err => (err ? reject(err) : resolve()));
  });
}

/*@internal*/
export async function copyFile(src: string, dest: string) {
  const content = await readFile(src);
  await writeFile(dest, content);
}

export function offsetToLineAndColumn(string: string, offset: number) {
  let lines = string.split('\n');
  let line = 0;
  let seen = 0;
  while (true) {
    if (seen + lines[line].length >= offset) {
      break;
    }
    seen += lines[line].length + 1; // +1 for the '\n'
    ++line;
  }
  let column = offset - seen;
  return { line: line + 1, column: column + 1 };
}

export function getLocation(dom: any, node: Element): MarkupData.ElementLocation {
  let loc = dom.nodeLocation(node);
  if (!loc || !loc.startTag) {
    throw new Error('could not find location: this is a bug in ecmarkdown; please report it');
  }
  return loc;
}

export function attrValueLocation(
  source: string | undefined,
  loc: MarkupData.ElementLocation,
  attr: string
) {
  let attrLoc = loc.startTag.attrs[attr];
  if (attrLoc == null || source == null) {
    return { line: loc.startTag.line, column: loc.startTag.col };
  } else {
    let tagText = source.slice(attrLoc.startOffset, attrLoc.endOffset);
    // RegExp.escape when
    let matcher = new RegExp(attr.replace(/[/\\^$*+?.()|[\]{}]/g, '\\$&') + '="?', 'i');
    return { line: attrLoc.line, column: attrLoc.col + (tagText.match(matcher)?.[0].length ?? 0) };
  }
}
