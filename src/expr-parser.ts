import type { FragmentNode } from 'ecmarkdown';
import { formatEnglishList } from './header-parser';

const tokMatcher =
  /(?<olist>&laquo;|«)|(?<clist>&raquo;|»)|(?<orec>\{)|(?<crec>\})|(?<oparen>\()|(?<cparen>\))|(?<and>(?:, )?and )|(?<is> is )|(?<comma>,)|(?<period>\.(?= |$))|(?<x_of>\b\w+ of )|(?<with_args> with arguments? )/u;

type SimpleLocation = { start: { offset: number }; end: { offset: number } };
type BareText = { name: 'text'; contents: string; location: { start: { offset: number } } }; // like TextNode, but with less complete location information
type ProsePart = FragmentNode | BareText;
type Fragment = {
  type: 'fragment';
  frag: ProsePart;
  location: SimpleLocation;
};
type List = {
  type: 'list';
  elements: Seq[];
  location: SimpleLocation;
};
type Record = {
  type: 'record';
  members: { name: string; value: Seq }[];
  location: SimpleLocation;
};
type RecordSpec = {
  type: 'record-spec';
  members: { name: string }[];
  location: SimpleLocation;
};
type Call = {
  type: 'call';
  callee: ProsePart[]; // nonempty
  arguments: Seq[];
  location: SimpleLocation;
};
type SDOCall = {
  type: 'sdo-call';
  callee: [BareText]; // we put this in a length-one tuple for symmetry with Call
  parseNode: Seq;
  arguments: Seq[];
  location: SimpleLocation;
};
type Paren = {
  type: 'paren';
  items: NonSeq[];
  location: SimpleLocation;
};
type Figure = {
  type: 'figure';
  location: SimpleLocation;
};
export type Seq = {
  type: 'seq';
  items: NonSeq[];
};
type NonSeq = Fragment | List | Record | RecordSpec | Call | SDOCall | Paren | Figure;
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
  | 'with_args'
  | 'figure';
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
type SimpleToken = { type: TokenType; offset: number; source: string };
type Token = Fragment | SimpleToken;

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
  if (token.type === 'fragment') {
    const prev = items[items.length - 1];
    if (
      token.frag.name === 'text' &&
      prev?.type === 'fragment' &&
      prev.frag.name === 'text' &&
      prev.location.end.offset === token.location.start.offset // might be false when e.g. skipping tags
    ) {
      // join with previous token
      items[items.length - 1] = {
        type: 'fragment',
        frag: {
          name: 'text',
          contents: prev.frag.contents + token.frag.contents,
          location: { start: { offset: prev.location.start.offset } },
        },
        location: {
          start: { offset: prev.location.start.offset },
          end: { offset: token.location.end.offset },
        },
      };
    } else {
      items.push(token);
    }
  } else {
    // invoke addProse so it has a chance to join
    addProse(items, {
      type: 'fragment',
      frag: {
        name: 'text',
        contents: token.source,
        location: { start: { offset: token.offset } },
      },
      location: {
        start: { offset: token.offset },
        end: { offset: token.offset + token.source.length },
      },
    });
  }
}

function isWhitespace(x: Fragment) {
  return x.frag.name === 'text' && /^\s*$/.test(x.frag.contents);
}

function isEmpty(s: Seq) {
  return s.items.every(i => i.type === 'fragment' && isWhitespace(i));
}

function emptyThingHasNewline(s: Seq) {
  // only call this function on things which pass isEmpty
  return s.items.some(i =>
    ((i as Fragment).frag as { name: 'text'; contents: string }).contents.includes('\n')
  );
}

function getTagName(
  tok: ProsePart
): 'open-del' | 'close-del' | 'open-figure' | 'close-figure' | null {
  if (tok.name !== 'tag') {
    return null;
  }
  const lowcase = tok.contents.toLowerCase();
  if (lowcase.startsWith('<del>') || lowcase.startsWith('<del ')) {
    return 'open-del';
  } else if (lowcase.startsWith('</del>') || lowcase.startsWith('</del ')) {
    return 'close-del';
  } else if (lowcase.startsWith('<figure>') || lowcase.startsWith('<figure ')) {
    return 'open-figure';
  } else if (lowcase.startsWith('</figure>') || lowcase.startsWith('</figure ')) {
    return 'close-figure';
  } else {
    return null;
  }
}

class ExprParser {
  declare src: FragmentNode[];
  declare opNames: Set<String>;
  srcIndex = 0;
  textTokOffset: number | null = null; // offset into current text node; only meaningful if srcOffset points to a text node
  next: Token[] = [];
  constructor(src: FragmentNode[], opNames: Set<String>) {
    this.src = src;
    this.opNames = opNames;
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
    const commitProse = () => {
      while (currentProse.length > 0) {
        const frag = currentProse.shift()!;
        this.next.push({
          type: 'fragment',
          frag,
          location: {
            start: { offset: frag.location.start.offset },
            end: {
              offset:
                frag.name === 'text'
                  ? frag.location.start.offset + frag.contents.length
                  : frag.location.end.offset,
            },
          },
        });
      }
    };
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
      // the `tok.name !== 'text'` part in the test below is redundant but makes TS happier
      if (tok.name !== 'text' || match == null) {
        const empty =
          (tok.name === 'text' && tok.contents.length === 0) ||
          tok.name === 'tag' ||
          tok.name === 'opaqueTag' ||
          tok.name === 'comment';
        if (!empty) {
          currentProse.push(tok);
        }
        ++this.srcIndex;
        this.textTokOffset = null;
        // skip anything in `<del>`
        const tagName = getTagName(tok);
        if (tagName === 'open-del') {
          while (
            this.srcIndex < this.src.length &&
            getTagName(this.src[this.srcIndex]) !== 'close-del'
          ) {
            ++this.srcIndex;
          }
        } else if (tagName === 'open-figure') {
          while (
            this.srcIndex < this.src.length &&
            getTagName(this.src[this.srcIndex]) !== 'close-figure'
          ) {
            ++this.srcIndex;
          }
          commitProse();
          this.next.push({
            type: 'figure',
            offset: tok.location.start.offset,
            source: '',
          });
          return;
        }
        continue;
      }
      const { groups } = match;
      const before = tok.contents.slice(0, match.index);
      if (before.length > 0) {
        currentProse.push({ name: 'text', contents: before, location: tok.location });
      }
      const matchKind = Object.keys(groups!).find(x => groups![x] != null)!;
      commitProse();
      this.textTokOffset = (this.textTokOffset ?? 0) + match.index! + match[0].length;
      this.next.push({
        type: matchKind as TokenType,
        offset: tok.location.start.offset + match.index!,
        source: groups![matchKind],
      });
      return;
    }
    commitProse();
    this.next.push({
      type: 'eof',
      offset: this.src.length === 0 ? 0 : this.src[this.src.length - 1].location.end.offset,
      source: '',
    });
  }

  // returns true if this ate a newline
  private eatWhitespace(): boolean {
    let next;
    let hadNewline = false;
    while ((next = this.peek())?.type === 'fragment') {
      if (next.frag.name === 'text' && !/\S/.test(next.frag.contents)) {
        hadNewline ||= next.frag.contents.includes('\n');
        this.next.shift();
      } else {
        break;
      }
    }
    return hadNewline;
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
          if (!close.includes('eof')) {
            throw new ParseFailure(`unexpected eof (expected ${formatClose(close)})`, next.offset);
          }
          return { type: 'seq', items };
        }
        case 'fragment': {
          addProse(items, next);
          this.next.shift();
          break;
        }
        case 'olist': {
          const startTok = this.next.shift() as SimpleToken;
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
          const endTok = this.next.shift() as SimpleToken; // eat the clist
          items.push({
            type: 'list',
            elements,
            location: {
              start: { offset: startTok.offset },
              end: { offset: endTok.offset + endTok.source.length },
            },
          });
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
          // scan backwards looking for stuff like `_foo_.bar`
          // stop at the first space character or structured item
          const callee: ProsePart[] = [];
          for (let i = items.length - 1; i >= 0; --i) {
            const ppart = items[i];
            if (ppart.type !== 'fragment') {
              break;
            }
            if (ppart.frag.name === 'text') {
              const { contents } = ppart.frag;
              const spaceIndex = contents.lastIndexOf(' ');
              if (spaceIndex !== -1) {
                if (spaceIndex < contents.length - 1) {
                  const calleePart = contents.slice(spaceIndex + 1);
                  if (!/\p{Letter}/u.test(calleePart)) {
                    // e.g. -(x + 1)
                    break;
                  }
                  items[i] = {
                    type: 'fragment',
                    frag: {
                      name: 'text',
                      contents: contents.slice(0, spaceIndex + 1),
                      location: ppart.frag.location,
                    },
                    location: {
                      start: { offset: ppart.frag.location.start.offset },
                      end: { offset: ppart.frag.location.start.offset + spaceIndex + 1 },
                    },
                  };
                  // calleePart is nonempty because it matches \p{Letter}
                  callee.unshift({
                    name: 'text',
                    contents: calleePart,
                    location: {
                      start: { offset: ppart.frag.location.start.offset + spaceIndex + 1 },
                    },
                  });
                }
                break;
              }
            }
            callee.unshift(ppart.frag);
            items.pop();
          }
          if (callee.length > 0) {
            if (callee[0].name === 'text') {
              // check for -F(), which is negation of F() not an AO named -F
              const initialNonLetter = callee[0].contents.match(/^\P{Letter}+/u);
              if (initialNonLetter != null) {
                const extra = initialNonLetter[0].length;
                const extraLoc = callee[0].location.start.offset;
                // we know by construction that there is at least one letter, so this is guaranteed to be nonempty
                callee[0].contents = callee[0].contents.substring(extra);
                callee[0].location.start.offset += extra;
                const contents = callee[0].contents.substring(0, extra);
                addProse(items, {
                  type: 'fragment',
                  frag: {
                    name: 'text',
                    contents,
                    location: { start: { offset: extraLoc } },
                  },
                  location: {
                    start: { offset: extraLoc },
                    end: { offset: extraLoc + contents.length },
                  },
                });
              }
            }

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
            const cParen = this.next.shift() as SimpleToken;
            items.push({
              type: 'call',
              callee,
              arguments: args,
              location: {
                start: { offset: callee[0].location.start.offset },
                end: { offset: cParen.offset + cParen.source.length },
              },
            });
          } else {
            const oParen = this.next.shift() as SimpleToken;
            const parenContents = this.parseSeq(['cparen']).items;
            const cParen = this.next.shift() as SimpleToken;
            items.push({
              type: 'paren',
              items: parenContents,
              location: {
                start: { offset: oParen.offset },
                end: { offset: cParen.offset + cParen.source.length },
              },
            });
          }
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
          const oRecTok = this.next.shift() as SimpleToken;
          let type: 'record' | 'record-spec' | null = null;
          const members: ({ name: string; value: Seq } | { name: string })[] = [];
          while (true) {
            const hadNewline = this.eatWhitespace();
            const nextTok = this.peek();
            if (nextTok.type === 'crec') {
              if (!hadNewline) {
                // ideally this would be a lint failure, or better yet a formatting thing, but whatever
                throw new ParseFailure(
                  members.length > 0
                    ? 'trailing commas are only allowed when followed by a newline'
                    : 'records cannot be empty',
                  nextTok.offset
                );
              }
              break;
            }
            if (nextTok.type !== 'fragment') {
              throw new ParseFailure('expected to find record field name', nextTok.offset);
            }
            if (nextTok.frag.name !== 'text') {
              throw new ParseFailure(
                'expected to find record field name',
                nextTok.frag.location.start.offset
              );
            }
            const { contents } = nextTok.frag;
            const nameMatch = contents.match(/^\s*\[\[(?<name>\w+)\]\]\s*(?<colon>:?)/);
            if (nameMatch == null) {
              throw new ParseFailure(
                'expected to find record field',
                nextTok.frag.location.start.offset + contents.match(/^\s*/)![0].length
              );
            }
            const { name, colon } = nameMatch.groups!;
            if (members.find(x => x.name === name)) {
              throw new ParseFailure(
                `duplicate record field name ${name}`,
                nextTok.frag.location.start.offset + contents.match(/^\s*\[\[/)![0].length
              );
            }
            const shortenedText = nextTok.frag.contents.slice(nameMatch[0].length);
            const offset = nextTok.frag.location.start.offset + nameMatch[0].length;
            if (shortenedText.length === 0) {
              this.next.shift();
            } else {
              const shortened: ProsePart = {
                name: 'text',
                contents: shortenedText,
                location: {
                  start: { offset },
                },
              };
              this.next[0] = {
                type: 'fragment',
                frag: shortened,
                location: {
                  start: { offset },
                  end: { offset: offset + shortenedText.length },
                },
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
          const cRecTok = this.next.shift() as SimpleToken;
          // @ts-expect-error typing this properly is annoying
          items.push({
            type: type!,
            members,
            location: {
              start: { offset: oRecTok.offset },
              end: { offset: cRecTok.offset + cRecTok.source.length },
            },
          });
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
          const callee = next.source.split(' ')[0];
          if (!this.opNames.has(callee)) {
            addProse(items, next);
            break;
          }
          const parseNode = this.parseSeq([
            'eof',
            'period',
            'comma',
            'cparen',
            'clist',
            'crec',
            'with_args',
          ]);
          const args: Seq[] = [];
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
          const lastThing = args.length > 0 ? args[args.length - 1] : parseNode;
          items.push({
            type: 'sdo-call',
            callee: [
              {
                name: 'text',
                contents: callee,
                location: { start: { offset: next.offset } },
              },
            ],
            parseNode,
            arguments: args,
            location: {
              start: { offset: next.offset },
              end: { offset: lastThing.items[lastThing.items.length - 1].location.end.offset },
            },
          });
          break;
        }
        case 'figure': {
          const tok = this.next.shift() as SimpleToken;
          items.push({
            type: 'figure',
            location: {
              start: { offset: tok.offset },
              end: { offset: tok.offset + tok.source.length },
            },
          });
          break;
        }
        default: {
          // @ts-expect-error
          throw new Error(`unreachable: unknown token type ${next.type}`);
        }
      }
    }
  }
}

// Note: this does not necessarily represent the entire input
// in particular it may omit some whitespace, tags, and comments
export function parse(src: FragmentNode[], opNames: Set<String>): Seq | Failure {
  const parser = new ExprParser(src, opNames);
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
  | { parent: Call; index: number }
  | { parent: SDOCall; index: number };
export function walk(
  f: (expr: Expr, path: PathItem[]) => void,
  current: Expr,
  path: PathItem[] = []
) {
  f(current, path);
  switch (current.type) {
    case 'fragment': {
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
    case 'figure': {
      break;
    }
    default: {
      // @ts-expect-error
      throw new Error(`unreachable: unknown expression node type ${current.type}`);
    }
  }
}
