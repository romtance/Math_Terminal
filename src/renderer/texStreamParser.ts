import type { TexBlock, TexDelimiter } from '../shared/previewTypes';

type ParserState = 'normal' | 'inDollarBlock' | 'inBracketBlock' | 'escape';
type EscapeState = 'start' | 'csi' | 'osc' | 'oscEsc' | 'single';

export type TexStreamParserOptions = {
  maxBlockLength?: number;
};

export class TexStreamParser {
  private readonly maxBlockLength: number;
  private state: ParserState = 'normal';
  private blockState: ParserState = 'normal';
  private escapeState: EscapeState = 'start';
  private block = '';
  private pending = '';
  private counter = 0;

  constructor(options: TexStreamParserOptions = {}) {
    this.maxBlockLength = options.maxBlockLength ?? 20_000;
  }

  push(chunk: string): TexBlock[] {
    const blocks: TexBlock[] = [];

    for (const char of chunk) {
      if (this.state === 'escape') {
        this.consumeEscape(char);
        continue;
      }

      if (char === '') {
        this.enterEscape();
        continue;
      }

      if (this.state === 'normal') {
        this.consumeNormal(char);
        continue;
      }

      const block = this.consumeBlock(char);
      if (block) {
        blocks.push(block);
      }
    }

    return blocks;
  }

  reset(): void {
    this.state = 'normal';
    this.blockState = 'normal';
    this.block = '';
    this.pending = '';
  }

  private consumeNormal(char: string): void {
    const candidate = this.pending + char;

    if (candidate === '$$') {
      this.startBlock('inDollarBlock');
      return;
    }

    if (candidate === '\\[') {
      this.startBlock('inBracketBlock');
      return;
    }

    this.pending = char === '$' || char === '\\' ? char : '';
  }

  private consumeBlock(char: string): TexBlock | null {
    const candidate = this.pending + char;

    if (this.state === 'inDollarBlock' && candidate === '$$') {
      return this.finishBlock('dollar-dollar');
    }

    if (this.state === 'inBracketBlock' && candidate === '\\]') {
      return this.finishBlock('bracket');
    }

    if (this.pending) {
      this.block += this.pending;
    }

    this.pending = shouldHoldPotentialClosingChar(this.state, char) ? char : '';

    if (!this.pending) {
      this.block += char;
    }

    if (this.block.length > this.maxBlockLength) {
      this.reset();
    }

    return null;
  }

  private startBlock(state: ParserState): void {
    this.state = state;
    this.blockState = state;
    this.block = '';
    this.pending = '';
  }

  private finishBlock(delimiter: TexDelimiter): TexBlock {
    const source = this.block.trim();
    this.reset();
    this.counter += 1;

    return {
      id: `tex-${this.counter}`,
      delimiter,
      source
    };
  }

  private enterEscape(): void {
    this.blockState = this.state;
    this.escapeState = 'start';
    this.state = 'escape';
  }

  private consumeEscape(char: string): void {
    switch (this.escapeState) {
      case 'start':
        this.consumeEscapeStart(char);
        return;
      case 'csi':
        if (isAnsiTerminator(char)) {
          this.state = this.blockState;
        }
        return;
      case 'osc':
        if (char === '') {
          this.state = this.blockState;
        } else if (char === '') {
          this.escapeState = 'oscEsc';
        }
        return;
      case 'oscEsc':
        this.state = this.blockState;
        if (char !== '\\') {
          this.consumeVisibleChar(char);
        }
        return;
      case 'single':
        this.state = this.blockState;
        return;
    }
  }

  private consumeEscapeStart(char: string): void {
    if (char === '[') {
      this.escapeState = 'csi';
      return;
    }

    if (char === ']') {
      this.escapeState = 'osc';
      return;
    }

    this.escapeState = 'single';
    this.state = this.blockState;
  }

  private consumeVisibleChar(char: string): void {
    if (this.state === 'normal') {
      this.consumeNormal(char);
      return;
    }

    this.consumeBlock(char);
  }
}

function shouldHoldPotentialClosingChar(state: ParserState, char: string): boolean {
  if (state === 'inDollarBlock') {
    return char === '$';
  }

  if (state === 'inBracketBlock') {
    return char === '\\';
  }

  return false;
}

function isAnsiTerminator(char: string): boolean {
  const code = char.charCodeAt(0);
  return code >= 0x40 && code <= 0x7e;
}
