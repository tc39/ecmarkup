import type { parseFragment } from 'ecmarkdown';
import { formatEnglishList } from './header-parser';

// TODO export FragmentNode
type Unarray<T> = T extends Array<infer U> ? U : T;
type FragmentNode = Unarray<ReturnType<typeof parseFragment>>;

const tokMatcher =
  /(?<olist>&laquo;|«)|(?<clist>&raquo;|»)|(?<orec>\{)|(?<crec>\})|(?<oparen>\()|(?<cparen>\))|(?<and>(?:, )?and )|(?<is> is )|(?<comma>,)|(?<period>\.(?= |$))|(?<x_of>\b\w+ of )|(?<with_args> with arguments? )/u;

type ProsePart =
  | FragmentNode
  | { name: 'text'; contents: string; location: { start: { offset: number } } };
type Prose = {
  type: 'prose';
  parts: ProsePart[]; // nonempty
};
type List = {
  type: 'list';
  elements: Seq[];
};
type Record = {
  type: 'record';
  members: { name: string; value: Seq }[];
};
type RecordSpec = {
  type: 'record-spec';
  members: { name: string }[];
};
type Call = {
  type: 'call';
  callee: Prose;
  arguments: Seq[];
};
type SDOCall = {
  type: 'sdo-call';
  callee: Prose; // could just be string, but this way we get location and symmetry with Call
  parseNode: Seq;
  arguments: Seq[];
};
type Paren = {
  type: 'paren';
  items: NonSeq[];
};
export type Seq = {
  type: 'seq';
  items: NonSeq[];
};
type NonSeq = Prose | List | Record | RecordSpec | Call | SDOCall | Paren;
export type Expr = NonSeq | Seq;
type Failure = { type: 'failure'; message: string; offset: number };

type TokenType =
  | 'eof'
  | 'olist'
  | 'clist'
  | 'orec'
  | 'crec'
  | 'oparen'
  | 'cparen'
  | 'and'
  | 'is'
  | 'comma'
  | 'period'
  | 'x_of'
  | 'with_args';
type CloseTokenType =
  | 'clist'
  | 'crec'
  | 'cparen'
  | 'and'
  | 'is'
  | 'comma'
  | 'period'
  | 'eof'
  | 'with_args';
type Token = Prose | { type: TokenType; offset: number; source: string };

class ParseFailure extends Error {
  declare offset: number;
  constructor(message: string, offset: number) {
    super(message);
    this.offset = offset;
  }
}

function formatClose(close: CloseTokenType[]) {
  const mapped = close.map(c => {
    switch (c) {
      case 'clist':
        return 'list close';
      case 'crec':
        return 'record close';
      case 'cparen':
        return 'close parenthesis';
      case 'eof':
        return 'end of line';
      case 'with_args':
        return '"with argument(s)"';
      case 'comma':
        return 'comma';
      case 'period':
        return 'period';
      case 'and':
        return '"and"';
      case 'is':
        return '"is"';
      default:
        return c;
    }
  });
  return formatEnglishList(mapped, 'or');
}

function addProse(items: NonSeq[], token: Token) {
  // sometimes we determine after seeing a token that it should not have been treated as a token
  // in that case we want to join it with the preceding prose, if any
  let prev = items[items.length - 1];
  if (token.type === 'prose') {
    if (prev == null || prev.type !== 'prose') {
      items.push(token);
    } else {
      let lastPartOfPrev = prev.parts[prev.parts.length - 1];
      let firstPartOfThis = token.parts[0];
      if (lastPartOfPrev?.name === 'text' && firstPartOfThis?.name === 'text') {
        items[items.length - 1] = {
          type: 'prose',
          parts: [
            ...prev.parts.slice(0, -1),
            {
              name: 'text',
              contents: lastPartOfPrev.contents + firstPartOfThis.contents,
              location: { start: { offset: lastPartOfPrev.location.start.offset } },
            },
            ...token.parts.slice(1),
          ],
        };
      } else {
        items[items.length - 1] = {
          type: 'prose',
          parts: [...prev.parts, ...token.parts],
        };
      }
    }
  } else {
    addProse(items, {
      type: 'prose',
      parts: [
        {
          name: 'text',
          contents: token.source,
          location: { start: { offset: token.offset } },
        },
      ],
    });
  }
}

function isWhitespace(x: Prose) {
  return x.parts.every(p => p.name === 'text' && /^\s*$/.test(p.contents));
}

function isEmpty(s: Seq) {
  return s.items.every(i => i.type === 'prose' && isWhitespace(i));
}

function emptyThingHasNewline(s: Seq) {
  // only call this function on things which pass isEmpty
  return s.items.some(i =>
    (i as Prose).parts.some(p => (p as { name: 'text'; contents: string }).contents.includes('\n'))
  );
}

class ExprParser {
  declare src: FragmentNode[];
  declare sdoNames: Set<String>;
  srcIndex = 0;
  textTokOffset: number | null = null; // offset into current text node; only meaningful if srcOffset points to a text node
  next: Token[] = [];
  constructor(src: FragmentNode[], sdoNames: Set<String>) {
    this.src = src;
    this.sdoNames = sdoNames;
  }

  private peek(): Token {
    if (this.next.length === 0) {
      this.advance();
    }
    return this.next[0];
  }

  // this method is complicated because the underlying data is a sequence of ecmarkdown fragments, not a string
  private advance() {
    const currentProse: ProsePart[] = [];
    while (this.srcIndex < this.src.length) {
      const tok: ProsePart =
        this.textTokOffset == null
          ? this.src[this.srcIndex]
          : {
              name: 'text',
              contents: (this.src[this.srcIndex].contents as string).slice(this.textTokOffset),
              location: {
                start: {
                  offset: this.src[this.srcIndex].location.start.offset + this.textTokOffset,
                },
              },
            };
      const match = tok.name === 'text' ? tok.contents.match(tokMatcher) : null;
      if (tok.name !== 'text' || match == null) {
        if (!(tok.name === 'text' && tok.contents.length === 0)) {
          currentProse.push(tok);
        }
        ++this.srcIndex;
        this.textTokOffset = null;
        continue;
      }
      const { groups } = match;
      const before = tok.contents.slice(0, match.index);
      if (before.length > 0) {
        currentProse.push({ name: 'text', contents: before, location: tok.location });
      }
      const matchKind = Object.keys(groups!).find(x => groups![x] != null)!;
      if (currentProse.length > 0) {
        this.next.push({ type: 'prose', parts: currentProse });
      }
      this.textTokOffset = (this.textTokOffset ?? 0) + match.index! + match[0].length;
      this.next.push({
        type: matchKind as TokenType,
        offset: tok.location.start.offset + match.index!,
        source: groups![matchKind],
      });
      return;
    }
    if (currentProse.length > 0) {
      this.next.push({ type: 'prose', parts: currentProse });
    }
    this.next.push({
      type: 'eof',
      offset: this.src.length === 0 ? 0 : this.src[this.src.length - 1].location.end.offset,
      source: '',
    });
  }

  // guarantees the next token is an element of close
  parseSeq(close: CloseTokenType[]): Seq {
    const items: NonSeq[] = [];
    while (true) {
      const next = this.peek();
      switch (next.type) {
        case 'and':
        case 'is':
        case 'period':
        case 'with_args':
        case 'comma': {
          if (!close.includes(next.type)) {
            addProse(items, next);
            this.next.shift();
            break;
          }
          if (items.length === 0) {
            throw new ParseFailure(
              `unexpected ${next.type} (expected some content for element/argument)`,
              next.offset
            );
          }
          return { type: 'seq', items };
        }
        case 'eof': {
          if (items.length === 0 || !close.includes('eof')) {
            throw new ParseFailure(`unexpected eof (expected ${formatClose(close)})`, next.offset);
          }
          return { type: 'seq', items };
        }
        case 'prose': {
          addProse(items, next);
          this.next.shift();
          break;
        }
        case 'olist': {
          this.next.shift();
          const elements: Seq[] = [];
          if (this.peek().type !== 'clist') {
            while (true) {
              elements.push(this.parseSeq(['clist', 'comma']));
              if (this.peek().type === 'clist') {
                break;
              }
              this.next.shift();
            }
          }
          if (elements.length > 0 && isEmpty(elements[elements.length - 1])) {
            if (elements.length === 1 || emptyThingHasNewline(elements[elements.length - 1])) {
              // allow trailing commas when followed by whitespace
              elements.pop();
            } else {
              throw new ParseFailure(
                `unexpected list close (expected some content for element)`,
                (this.peek() as { offset: number }).offset
              );
            }
          }
          items.push({ type: 'list', elements });
          this.next.shift(); // eat the clist
          break;
        }
        case 'clist': {
          if (!close.includes('clist')) {
            throw new ParseFailure(
              'unexpected list close without corresponding list open',
              next.offset
            );
          }
          return { type: 'seq', items };
        }
        case 'oparen': {
          const lastPart = items[items.length - 1];
          if (lastPart != null && lastPart.type === 'prose') {
            const callee: ProsePart[] = [];
            for (let i = lastPart.parts.length - 1; i >= 0; --i) {
              const ppart = lastPart.parts[i];
              if (ppart.name === 'text') {
                const spaceIndex = ppart.contents.lastIndexOf(' ');
                if (spaceIndex !== -1) {
                  if (spaceIndex < ppart.contents.length - 1) {
                    const calleePart = ppart.contents.slice(spaceIndex + 1);
                    if (!/\p{Letter}/u.test(calleePart)) {
                      // e.g. -(x + 1)
                      break;
                    }
                    lastPart.parts[i] = {
                      name: 'text',
                      contents: ppart.contents.slice(0, spaceIndex + 1),
                      location: ppart.location,
                    };
                    callee.unshift({
                      name: 'text',
                      contents: calleePart,
                      location: {
                        start: { offset: ppart.location.start.offset + spaceIndex + 1 },
                      },
                    });
                  }
                  break;
                }
              } else if (ppart.name === 'tag') {
                break;
              }
              callee.unshift(ppart);
              lastPart.parts.pop();
            }
            if (callee.length > 0) {
              this.next.shift();
              const args: Seq[] = [];
              if (this.peek().type !== 'cparen') {
                while (true) {
                  args.push(this.parseSeq(['cparen', 'comma']));
                  if (this.peek().type === 'cparen') {
                    break;
                  }
                  this.next.shift();
                }
              }
              if (args.length > 0 && isEmpty(args[args.length - 1])) {
                if (args.length === 1 || emptyThingHasNewline(args[args.length - 1])) {
                  // allow trailing commas when followed by a newline
                  args.pop();
                } else {
                  throw new ParseFailure(
                    `unexpected close parenthesis (expected some content for argument)`,
                    (this.peek() as { offset: number }).offset
                  );
                }
              }
              items.push({
                type: 'call',
                callee: { type: 'prose', parts: callee },
                arguments: args,
              });
              this.next.shift(); // eat the cparen
              break;
            }
          }
          this.next.shift();
          items.push({ type: 'paren', items: this.parseSeq(['cparen']).items });
          this.next.shift(); // eat the cparen
          break;
        }
        case 'cparen': {
          if (!close.includes('cparen')) {
            throw new ParseFailure(
              'unexpected close parenthesis without corresponding open parenthesis',
              next.offset
            );
          }
          return { type: 'seq', items };
        }
        case 'orec': {
          this.next.shift();
          let type: 'record' | 'record-spec' | null = null;
          const members: ({ name: string; value: Seq } | { name: string })[] = [];
          while (true) {
            const nextTok = this.peek();
            if (nextTok.type !== 'prose') {
              throw new ParseFailure('expected to find record field name', nextTok.offset);
            }
            if (nextTok.parts[0].name !== 'text') {
              throw new ParseFailure(
                'expected to find record field name',
                nextTok.parts[0].location.start.offset
              );
            }
            const { contents } = nextTok.parts[0];
            const nameMatch = contents.match(/^\s*\[\[(?<name>\w+)\]\]\s*(?<colon>:?)/);
            if (nameMatch == null) {
              if (members.length > 0 && /^\s*$/.test(contents) && contents.includes('\n')) {
                // allow trailing commas when followed by a newline
                this.next.shift(); // eat the whitespace
                if (this.peek().type === 'crec') {
                  this.next.shift();
                  break;
                }
              }
              throw new ParseFailure(
                'expected to find record field',
                nextTok.parts[0].location.start.offset + contents.match(/^\s*/)![0].length
              );
            }
            const { name, colon } = nameMatch.groups!;
            if (members.find(x => x.name === name)) {
              throw new ParseFailure(
                `duplicate record field name ${name}`,
                nextTok.parts[0].location.start.offset + contents.match(/^\s*\[\[/)![0].length
              );
            }
            const shortenedText = nextTok.parts[0].contents.slice(nameMatch[0].length);
            const offset = nextTok.parts[0].location.start.offset + nameMatch[0].length;
            if (shortenedText.length === 0 && nextTok.parts.length === 1) {
              this.next.shift();
            } else if (shortenedText.length === 0) {
              this.next[0] = {
                type: 'prose',
                parts: nextTok.parts.slice(1),
              };
            } else {
              const shortened: ProsePart = {
                name: 'text',
                contents: shortenedText,
                location: {
                  start: { offset },
                },
              };
              this.next[0] = {
                type: 'prose',
                parts: [shortened, ...nextTok.parts.slice(1)],
              };
            }
            if (colon) {
              if (type == null) {
                type = 'record';
              } else if (type === 'record-spec') {
                throw new ParseFailure(
                  'record field has value but preceding field does not',
                  offset - 1
                );
              }
              const value = this.parseSeq(['crec', 'comma']);
              if (value.items.length === 0) {
                throw new ParseFailure('expected record field to have value', offset);
              }
              members.push({ name, value });
            } else {
              if (type == null) {
                type = 'record-spec';
              } else if (type === 'record') {
                throw new ParseFailure('expected record field to have value', offset - 1);
              }
              members.push({ name });
              if (!['crec', 'comma'].includes(this.peek().type)) {
                throw new ParseFailure(`expected ${formatClose(['crec', 'comma'])}`, offset);
              }
            }
            if (this.peek().type === 'crec') {
              break;
            }
            this.next.shift(); // eat the comma
          }
          // @ts-ignore typing this correctly is annoying
          items.push({ type, members });
          this.next.shift(); // eat the crec
          break;
        }
        case 'crec': {
          if (!close.includes('crec')) {
            throw new ParseFailure(
              'unexpected end of record without corresponding start of record',
              next.offset
            );
          }
          return { type: 'seq', items };
        }
        case 'x_of': {
          this.next.shift();
          let callee = next.source.split(' ')[0];
          if (!this.sdoNames.has(callee)) {
            addProse(items, next);
            break;
          }
          let parseNode = this.parseSeq([
            'eof',
            'period',
            'comma',
            'cparen',
            'clist',
            'crec',
            'with_args',
          ]);
          let args: Seq[] = [];
          if (this.peek().type === 'with_args') {
            this.next.shift();
            while (true) {
              args.push(
                this.parseSeq([
                  'eof',
                  'period',
                  'and',
                  'is',
                  'comma',
                  'cparen',
                  'clist',
                  'crec',
                  'with_args',
                ])
              );
              if (!['and', 'comma'].includes(this.peek().type)) {
                break;
              }
              this.next.shift();
            }
          }
          items.push({
            type: 'sdo-call',
            callee: {
              type: 'prose',
              parts: [
                { name: 'text', contents: callee, location: { start: { offset: next.offset } } },
              ],
            },
            parseNode,
            arguments: args,
          });
          // console.log(require('util').inspect(items[items.length - 1], { depth: Infinity }));
          break;
        }
        default: {
          // @ts-ignore
          throw new Error(`unreachable: unknown token type ${next.type}`);
        }
      }
    }
  }
}

export function parse(src: FragmentNode[], sdoNames: Set<String>): Seq | Failure {
  const parser = new ExprParser(src, sdoNames);
  try {
    return parser.parseSeq(['eof']);
  } catch (e) {
    if (e instanceof ParseFailure) {
      return { type: 'failure', message: e.message, offset: e.offset };
    }
    throw e;
  }
}

export type PathItem =
  | { parent: List | Record | Seq | Paren; index: number }
  | { parent: Call; index: 'callee' | number }
  | { parent: SDOCall; index: 'callee' | number };
export function walk(
  f: (expr: Expr, path: PathItem[]) => void,
  current: Expr,
  path: PathItem[] = []
) {
  // console.log('path', path, current.type);
  f(current, path);
  switch (current.type) {
    case 'prose': {
      break;
    }
    case 'list': {
      for (let i = 0; i < current.elements.length; ++i) {
        path.push({ parent: current, index: i });
        walk(f, current.elements[i], path);
        path.pop();
      }
      break;
    }
    case 'record': {
      for (let i = 0; i < current.members.length; ++i) {
        path.push({ parent: current, index: i });
        walk(f, current.members[i].value, path);
        path.pop();
      }
      break;
    }
    case 'record-spec': {
      break;
    }
    case 'sdo-call': {
      for (let i = 0; i < current.arguments.length; ++i) {
        path.push({ parent: current, index: i });
        walk(f, current.arguments[i], path);
        path.pop();
      }
      break;
    }
    case 'call': {
      path.push({ parent: current, index: 'callee' });
      walk(f, current.callee, path);
      path.pop();
      for (let i = 0; i < current.arguments.length; ++i) {
        path.push({ parent: current, index: i });
        walk(f, current.arguments[i], path);
        path.pop();
      }
      break;
    }
    case 'paren':
    case 'seq': {
      for (let i = 0; i < current.items.length; ++i) {
        path.push({ parent: current, index: i });
        walk(f, current.items[i], path);
        path.pop();
      }
      break;
    }
    default: {
      // @ts-ignore
      throw new Error(`unreachable: unknown expression node type ${current.type}`);
    }
  }
}
