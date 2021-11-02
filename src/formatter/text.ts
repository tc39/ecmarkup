import { LineBuilder } from './line-builder';

export function printText(text: string, indent: number): LineBuilder {
  const output: LineBuilder = new LineBuilder(indent);
  if (text === '') {
    return output;
  }

  const leadingSpace = text[0] === ' ' || text[0] === '\t';
  const trailingSpace = text[text.length - 1] === ' ' || text[text.length - 1] === '\t';

  const lines = text.split('\n').map(l => l.trim());

  if (leadingSpace) {
    output.appendText(' ');
  }
  if (lines.length === 1) {
    if (lines[0] !== '') {
      output.appendText(lines[0]);
      if (trailingSpace) {
        output.appendText(' ');
      }
    }
    return output;
  }
  for (let i = 0; i < lines.length - 1; ++i) {
    output.appendText(lines[i]);
    output.linebreak();
  }
  output.appendText(lines[lines.length - 1]);
  if (trailingSpace && output.last !== '') {
    output.appendText(' ');
  }

  return output;
}
