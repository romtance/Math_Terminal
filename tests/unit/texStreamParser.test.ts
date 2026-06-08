import { describe, expect, it } from 'vitest';
import { TexStreamParser } from '../../src/renderer/texStreamParser';

describe('TexStreamParser', () => {
  it('emits a dollar block from one chunk', () => {
    const parser = new TexStreamParser();
    const blocks = parser.push('before $$E=mc^2$$ after');

    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({
      delimiter: 'dollar-dollar',
      source: 'E=mc^2'
    });
  });

  it('emits a bracket block from one chunk', () => {
    const parser = new TexStreamParser();
    const blocks = parser.push('\\[a^2+b^2=c^2\\]');

    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({
      delimiter: 'bracket',
      source: 'a^2+b^2=c^2'
    });
  });

  it('handles delimiters split across chunks', () => {
    const parser = new TexStreamParser();

    expect(parser.push('$')).toHaveLength(0);
    expect(parser.push('$E=')).toHaveLength(0);
    expect(parser.push('mc^2$')).toHaveLength(0);

    const blocks = parser.push('$');
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.source).toBe('E=mc^2');
  });

  it('handles bracket delimiters split across chunks', () => {
    const parser = new TexStreamParser();

    expect(parser.push('\\')).toHaveLength(0);
    expect(parser.push('[x+')).toHaveLength(0);
    expect(parser.push('y=')).toHaveLength(0);
    expect(parser.push('z\\')).toHaveLength(0);

    const blocks = parser.push(']');
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.source).toBe('x+y=z');
  });

  it('emits multiple blocks from one chunk', () => {
    const parser = new TexStreamParser();
    const blocks = parser.push('$$a$$ text \\[b\\]');

    expect(blocks).toHaveLength(2);
    expect(blocks.map((block) => block.source)).toEqual(['a', 'b']);
  });

  it('ignores ANSI escapes around delimiters', () => {
    const parser = new TexStreamParser();
    const blocks = parser.push('[31m$$E=mc^2$$[0m');

    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.source).toBe('E=mc^2');
  });

  it('ignores ANSI escapes inside math content', () => {
    const parser = new TexStreamParser();
    const blocks = parser.push('$$E=[31mmc[0m^2$$');

    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.source).toBe('E=mc^2');
  });

  it('does not emit unterminated blocks', () => {
    const parser = new TexStreamParser();

    expect(parser.push('$$E=mc^2')).toHaveLength(0);
  });

  it('resets oversized blocks safely', () => {
    const parser = new TexStreamParser({ maxBlockLength: 3 });

    expect(parser.push('$$abcd$$')).toHaveLength(0);
    expect(parser.push('$$x$$')).toHaveLength(1);
  });

  it('does not treat a single dollar as a block', () => {
    const parser = new TexStreamParser();

    expect(parser.push('price is $5')).toHaveLength(0);
  });
});
