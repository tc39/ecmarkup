/*
represents a sequences of lines, where the last line can have more text stuck on the end
squashes multiple consecutive blank lines and multiple consecutive spaces
*/
export class LineBuilder {
  // if `firstLineIsPartial` is `true`, does not include indentation on that line
  indent: number;
  firstLineIsPartial = true;
  lines: string[] = [''];

  constructor(indent: number) {
    this.indent = indent;
  }

  append(other: LineBuilder): void {
    if (other.isEmpty()) {
      return;
    }
    if (this.isEmpty()) {
      this.firstLineIsPartial = other.firstLineIsPartial;
      this.lines = [...other.lines];
      return;
    }

    if (other.firstLineIsPartial) {
      if (
        this.last === '' &&
        other.lines.length > 1 &&
        other.lines[0] === '' &&
        other.lines[1] === ''
      ) {
        // max one blank line
        this.lines.pop();
      } else if (this.last.endsWith(' ') && other.lines[0].startsWith(' ')) {
        this.last = this.last.trimEnd();
      }
      this.appendText(other.lines[0], true); // we will already have stripped whitespace if we're supposed to do that
      this.lines = this.lines.concat(other.lines.slice(1));
    } else {
      this.last = this.last.trimEnd();
      if (this.last === '') {
        this.lines.pop();
      }
      if (this.last === '' && other.lines[0] === '') {
        this.lines.pop();
      }
      this.lines = this.lines.concat(other.lines);
    }
  }

  appendText(text: string, allowMultiSpace = false): void {
    if (text === '') {
      return;
    }

    if (this.needsIndent()) {
      text = text.trimStart();
      if (text === '') {
        return;
      }
      this.last += '  '.repeat(this.indent);
    }
    this.last += allowMultiSpace ? text : text.replace(/  +/g, ' ');
  }

  appendLine(text: string, allowMultiSpace = false): void {
    this.last = this.last.trimEnd();
    text = text.trim();
    if (text === '') {
      this.linebreak();
      return;
    }
    if (this.isEmpty()) {
      this.firstLineIsPartial = false;
    } else if (this.last !== '') {
      this.linebreak();
    }
    this.appendText(text, allowMultiSpace);
    this.linebreak();
  }

  linebreak(): void {
    if (this.isEmpty()) {
      this.firstLineIsPartial = false;
      return;
    }
    if (this.lines.length > 1 && this.lines[this.lines.length - 2] === '' && this.last === '') {
      // max one blank line
      return;
    }
    this.lines.push('');
  }

  isEmpty() {
    return this.firstLineIsPartial && this.lines.length === 1 && this.lines[0] === '';
  }

  trim() {
    this.firstLineIsPartial = true;
    while (this.lines.length > 1 && this.lines[0] === '') {
      this.lines.shift();
    }
    this.lines[0] = this.lines[0].trimStart();
    while (this.lines.length > 1 && this.last === '') {
      this.lines.pop();
    }
    this.last = this.last.trimEnd();
  }

  get last() {
    return this.lines[this.lines.length - 1];
  }

  set last(o) {
    this.lines[this.lines.length - 1] = o;
  }

  private needsIndent(): boolean {
    if (this.firstLineIsPartial && this.lines.length === 1) {
      // when firstLineIsPartial, we don't indent the first line
      return false;
    }
    return /^ *$/.test(this.last);
  }
}
