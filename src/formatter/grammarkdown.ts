import {
  CompilerOptions,
  NewLineKind,
  CoreAsyncHost,
  Grammar,
  GrammarkdownEmitter,
  skipTrivia,
  Node,
  CommentTrivia,
  SyntaxKind,
  Prose,
  ProseAssertion,
  RightHandSide,
  SourceFile,
  Production,
  OneOfList,
  RightHandSideList,
  ParameterList,
} from 'grammarkdown';
import { LineBuilder } from './line-builder';

// this whole thing is perverse, but I don't see a better way of doing it
// I also could not figure out how to get grammarkdown to do its own indenting at any higher level than this
const RAW_STRING_MARKER = 'RAW_STRING_MARKER';
type CommentWithSource = {
  kind: CommentTrivia['kind'];
  pos: number;
  end: number;
  source: string;
  isIgnore: boolean;
};
class EmitterWithComments extends GrammarkdownEmitter {
  declare source: string;
  declare root: SourceFile;
  declare done: Set<number>;
  declare rawParts: Map<string, string>;
  declare forceExpandRhs: boolean;
  declare commentsMap: Map<Node, CommentWithSource[]>;

  constructor(options: CompilerOptions, sourceFile: SourceFile) {
    super(options);
    this.source = sourceFile.text;
    this.done = new Set();
    this.rawParts = new Map();

    // combine like LHSes
    const productions = new Map<string, Production[]>();
    let needsReconstruction = false;
    for (const element of sourceFile.elements) {
      // TODO location information
      if (element.kind !== SyntaxKind.Production) {
        continue;
      }
      if (element.body == null) {
        throw new Error('production is missing its body');
      }
      if (element.name.text == null) {
        throw new Error('production is missing its name');
      }
      const name = element.name.text;
      if (productions.has(name)) {
        const existing = productions.get(name)!;
        if (existing.some(p => !parameterListEquals(p.parameterList, element.parameterList))) {
          throw new Error(`productions for ${name} have mismatched parameter lists`);
        }
        if (
          element.body.kind === SyntaxKind.OneOfList ||
          // we only need to check the existing list the first time; after that it will hold by construction
          (existing.length === 1 && existing[0].body?.kind === SyntaxKind.OneOfList)
        ) {
          throw new Error(`"one of" productions must not have any other right-hand sides`);
        }
        needsReconstruction = true;
        existing.push(element);
      } else {
        productions.set(name, [element]);
      }
    }

    this.commentsMap = new Map();
    if (needsReconstruction) {
      const elements = [];
      for (const element of sourceFile.elements) {
        if (element.kind !== SyntaxKind.Production) {
          elements.push(element);
          continue;
        }
        const prods = productions.get(element.name.text!)!;
        if (prods.length === 1) {
          elements.push(element);
          continue;
        }
        if (prods[0] === element) {
          const allComments = prods.flatMap(p => this.getComments(p));
          if (allComments.some(c => c.isIgnore)) {
            elements.push(...prods);
            continue;
          }

          const newRhses: RightHandSide[] = prods.flatMap(p => {
            if (p.body!.kind === SyntaxKind.RightHandSide) {
              return [p.body! as RightHandSide];
            } else if (p.body!.kind === SyntaxKind.RightHandSideList) {
              return (p.body as RightHandSideList).elements!;
            } else {
              throw new Error('unexpected RHS kind');
            }
          });
          const newList = new RightHandSideList(newRhses);
          const newProd = new Production(
            element.name,
            element.parameterList,
            element.colonToken,
            newList
          );
          elements.push(newProd);
          this.commentsMap.set(newProd, allComments);
          this.commentsMap.set(newList, []);
        }
        // otherwise we've combined it with a prior production and do not need to emit it
      }
      sourceFile = new SourceFile(sourceFile.filename, sourceFile.text, elements);
    }
    this.root = sourceFile;

    this.forceExpandRhs = sourceFile.elements.some(
      e => !(e.kind === SyntaxKind.Production) || e.body?.kind === SyntaxKind.RightHandSideList
    );
  }

  static emit(grammar: Grammar, options: CompilerOptions, indent: number): LineBuilder {
    const emitter = new EmitterWithComments(options, grammar.rootFiles[0]);
    let written: string;
    emitter.emit(emitter.root, grammar.resolver, grammar.diagnostics, (file, result) => {
      written = result;
    });
    // @ts-ignore I promise written is initialized now
    const lines = written.split('\n');
    if (lines[lines.length - 1] === '') {
      lines.pop();
    }
    const output = new LineBuilder(indent);
    for (const line of lines) {
      if (line.trimStart().startsWith(RAW_STRING_MARKER)) {
        output.appendLine(emitter.rawParts.get(line.trim())!, true);
        continue;
      }
      // this is a bit gross, but grammarkdown only has 0 or 1 level of indentation, so it works
      const shouldIndent = line.startsWith(' ');
      if (shouldIndent) {
        ++output.indent;
      }
      output.appendLine(htmlEntitize(line));
      if (shouldIndent) {
        --output.indent;
      }
    }
    return output;
  }

  emitNode(node: Node | undefined) {
    if (node && node.kind !== SyntaxKind.SourceFile) {
      const comments: CommentWithSource[] = this.getComments(node).filter(
        c => !this.done.has(c.pos)
      );
      if (comments.some(c => c.isIgnore)) {
        if (node.kind !== SyntaxKind.Production) {
          // TODO location information
          throw new Error(
            `"emu-format ignore" comments are only supported on full productions right now; if you need it elsewhere, open an issue on ecmarkup`
          );
        }
        // the source includes all comments and any leading HTML tags
        // it does not include trailing HTML tags, even though they are included in the AST
        const end = Math.max(node.end, ...(node.trailingHtmlTrivia ?? []).map(h => h.end));
        const nodeSource = this.source.substring(node.pos, end);
        const marker = RAW_STRING_MARKER + '_' + this.rawParts.size;
        this.rawParts.set(marker, nodeSource);
        this.writer.writeln(marker);
        return;
      }
      for (const comment of comments) {
        this.done.add(comment.pos);

        let hasTrailingNewline = false;
        if (comment.kind == SyntaxKind.MultiLineCommentTrivia) {
          for (let ind = comment.end + 1; ind < this.source.length; ++ind) {
            const char = this.source[ind];
            if (char === '\n' || char === '\r') {
              hasTrailingNewline = true;
            } else if (char !== ' ') {
              break;
            }
          }
        } else {
          hasTrailingNewline = true;
        }
        if (hasTrailingNewline) {
          this.writer.writeln(comment.source);
        } else {
          this.writer.write(comment.source + ' ');
        }
      }
    }
    super.emitNode(node);

    if (node?.kind === SyntaxKind.Production && (node.trailingHtmlTrivia ?? []).length > 0) {
      // partial workaround for https://github.com/rbuckton/grammarkdown/issues/80
      this.writer.writeln();
    }
  }

  getComments(node: Node): CommentWithSource[] {
    if (this.commentsMap.has(node)) {
      return this.commentsMap.get(node)!;
    }
    const comments: CommentTrivia[] = [];
    skipTrivia(this.source, node.pos, node.end, undefined, comments);
    return comments.map(c => {
      const source = this.source.substring(c.pos, c.end);
      return {
        kind: c.kind,
        pos: c.pos,
        end: c.end,
        source,
        isIgnore: /(\/\/|\/\*)\s*emu-format ignore/.test(source),
      };
    });
  }

  // for the collapsed case, keep it on one line
  emitOneOfList(node: OneOfList) {
    if (this.root.elements.length === 1 && !this.source.trim().includes('\n')) {
      this.writer.write('one of ');
      for (let i = 0; i < (node.terminals?.length ?? 0); ++i) {
        if (i > 0) {
          this.writer.write(' ');
        }
        this.emitNode(node.terminals![i]);
      }
    } else {
      super.emitOneOfList(node);
    }
  }

  // we always want a blank line between productions, even when collapsed
  // also, we want to un-collapse productions which are in blocks with other un-collapsed productions
  emitProduction(node: Production) {
    if (this.forceExpandRhs && node.body?.kind === SyntaxKind.RightHandSide) {
      const newBody = new RightHandSideList([node.body]);
      node = new Production(node.name, node.parameterList, node.colonToken, newBody);
    }
    super.emitProduction(node);
    const productions = this.root.elements.filter(e => e.kind === SyntaxKind.Production);
    if (
      productions.indexOf(node) < productions.length - 1 &&
      node.body?.kind === SyntaxKind.RightHandSide
    ) {
      this.writer.commitLine();
      this.writer.writeln();
    }
  }

  // we want specific spellings here
  emitTokenKind(kind: SyntaxKind) {
    if (kind === SyntaxKind.LessThanExclamationToken || kind === SyntaxKind.NotAnElementOfToken) {
      this.writer.write('&notin;');
    } else if (kind === SyntaxKind.LessThanMinusToken || kind === SyntaxKind.ElementOfToken) {
      this.writer.write('&isin;');
    } else {
      super.emitTokenKind(kind);
    }
  }

  // we need to avoid a literal `>`
  emitProse(node: Prose) {
    this.writer.write('&gt; ');
    node.fragments && this.emitNodes(node.fragments);
  }

  // we want a space after the `[>`
  emitProseAssertion(node: ProseAssertion) {
    this.writer.write(`[> `);
    if (node.fragments) {
      for (const fragment of node.fragments) {
        if (fragment.kind === SyntaxKind.Nonterminal) {
          // workaround for https://github.com/rbuckton/grammarkdown/issues/80#issuecomment-950265326
          this.writer.write(`|`);
          this.emitNode(fragment);
          this.writer.write(`|`);
        } else {
          this.emitNode(fragment);
        }
      }
    }

    this.writer.write(`]`);
  }

  // workaround for https://github.com/rbuckton/grammarkdown/issues/80#issuecomment-950265326
  emitRightHandSide(node: RightHandSide) {
    this.emitChildren(node);
    if (node.reference) {
      this.writer.write(` #${node.reference.text}`);
    }
  }
}

// uuuuugh, grammarkdown is only async
// that means everything else will need to be also
// TODO for consistency this should probably take the Grammar object?
// but grammarkdown does not make that very easy
export async function printGrammar(source: string, indent: number): Promise<LineBuilder> {
  const grammarHost = CoreAsyncHost.forFile(source);
  const options: CompilerOptions = {
    // for some reason grammarkdown does not expose its own emitter, so we can't just set the format here
    noChecks: true,
    newLine: NewLineKind.LineFeed,
  };
  const grammar = new Grammar([grammarHost.file], options, grammarHost);
  await grammar.bind();
  return EmitterWithComments.emit(grammar, options, indent);
}

const entities: Record<string, string> = {
  '“': '&ldquo;',
  '”': '&rdquo;',
  '≤': '&le;',
  '≥': '&ge;',
};
const entityRegex = new RegExp(`[${Object.keys(entities).join('')}]`, 'ug');
function htmlEntitize(source: string) {
  return source.replace(entityRegex, r => entities[r]);
}

function parameterListEquals(a: ParameterList | undefined, b: ParameterList | undefined) {
  if (a?.elements == null && a?.elements == null) {
    return true;
  }
  if (a?.elements == null || b?.elements == null) {
    return false;
  }
  return (
    a.elements.length === b.elements.length &&
    a.elements.every((e, i) => e.name.text === b.elements![i].name.text)
  );
}
