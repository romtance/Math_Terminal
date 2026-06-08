import { normalizeAiMarkdown } from './aiMarkdownNormalizer';

type CaptureState = 'idle' | 'capturing';

export type AiAnswerEntry = {
  id: string;
  title: string;
  excerpt: string;
  content: string;
  normalizedContent: string;
  createdAt: number;
};

const MAX_CAPTURE_LINES = 400;
const MAX_CAPTURE_CHARS = 24_000;

export class AiOutputCapture {
  private state: CaptureState = 'idle';
  private currentLines: string[] = [];
  private currentChars = 0;
  private entries: AiAnswerEntry[] = [];
  private counter = 0;
  private pendingPrompt = '';

  push(rawText: string): AiAnswerEntry[] {
    const completed: AiAnswerEntry[] = [];
    const lines = normalizeTerminalText(rawText).split('\n');

    // A PTY chunk normally ends with "\n", so split() leaves a trailing empty
    // element that is an artifact of the chunk boundary, not a real blank line.
    // Dropping it prevents a spurious blank line after every chunk — which would
    // otherwise split streamed multi-line blocks (e.g. markdown tables, whose
    // rows must stay contiguous) into separate paragraphs.
    if (lines.length > 1 && lines[lines.length - 1] === '') {
      lines.pop();
    }

    for (const line of lines) {
      const result = this.consumeLine(line);
      if (result) {
        completed.push(result);
      }
    }

    return completed;
  }

  setPrompt(prompt: string): void {
    const title = cleanPromptTitle(prompt);
    if (title) {
      this.pendingPrompt = title;
    }
  }

  flush(): AiAnswerEntry | null {
    return this.finishCurrent();
  }

  reset(): void {
    this.state = 'idle';
    this.currentLines = [];
    this.currentChars = 0;
    this.entries = [];
    this.pendingPrompt = '';
  }

  getEntries(): AiAnswerEntry[] {
    return [...this.entries];
  }

  private consumeLine(line: string): AiAnswerEntry | null {
    const rawTrimmed = line.trim();
    const cleaned = cleanTerminalLine(line);
    const trimmed = cleaned.trim();
    const promptLike = isPromptLine(rawTrimmed) || isPromptLine(trimmed);

    if (promptLike) {
      return this.finishCurrent();
    }

    if (!trimmed) {
      if (this.state === 'capturing') {
        this.appendCurrentLine('');
      }
      return null;
    }

    // Shell command prompt (e.g. C:\...\> or C:\...\❯) → discard, unless cleaning
    // recovered real answer content from a glued "path❯ question●answer" line.
    if (isShellPromptLine(rawTrimmed) && (!trimmed || isShellPromptLine(trimmed))) {
      this.state = 'idle';
      this.currentLines = [];
      this.currentChars = 0;
      return null;
    }

    const controlLine = isTerminalUiLine(trimmed) || isUserInputLine(trimmed);
    if (controlLine) {
      if (this.state === 'capturing') {
        this.dropTerminalUiLinesFromCurrent();
      }
      return null;
    }

    if (this.state === 'capturing') {
      if (this.wouldExceedCaptureLimit(cleaned)) {
        return this.finishCurrent();
      }

      this.appendCurrentLine(cleaned);
      return null;
    }

    if (looksLikeAiAnswerLine(trimmed)) {
      this.state = 'capturing';
      this.appendCurrentLine(cleaned);
    }

    return null;
  }

  private appendCurrentLine(line: string): void {
    this.currentLines.push(line);
    this.currentChars += line.length + 1;
  }

  private dropTerminalUiLinesFromCurrent(): void {
    this.currentLines = this.currentLines.filter((currentLine) => {
      const trimmedLine = currentLine.trim();
      return !isTerminalUiLine(trimmedLine) && !isUserInputLine(trimmedLine);
    });
    if (this.currentLines.length === 0) {
      this.currentChars = 0;
      this.state = 'idle';
      return;
    }

    this.currentChars = this.currentLines.reduce((total, currentLine) => total + currentLine.length + 1, 0);
  }

  private wouldExceedCaptureLimit(nextLine: string): boolean {
    return this.currentLines.length >= MAX_CAPTURE_LINES
      || this.currentChars + nextLine.length + 1 > MAX_CAPTURE_CHARS;
  }

  private finishCurrent(): AiAnswerEntry | null {
    const content = trimBlankLines(this.currentLines).join('\n').trim();
    this.state = 'idle';
    this.currentLines = [];
    this.currentChars = 0;

    if (!content) {
      return null;
    }

    const normalizedContent = normalizeAiMarkdown(content);
    if (!normalizedContent) {
      return null;
    }

    this.counter += 1;
    const entry: AiAnswerEntry = {
      id: `answer-${this.counter}`,
      title: createTitle(this.pendingPrompt || normalizedContent, this.counter),
      excerpt: createExcerpt(normalizedContent),
      content,
      normalizedContent,
      createdAt: Date.now()
    };

    this.pendingPrompt = '';
    this.entries.push(entry);
    return entry;
  }
}

function normalizeTerminalText(rawText: string): string {
  return stripAnsi(rawText)
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map(line => {
      const parts = line.split('\r');
      return parts[parts.length - 1] ?? '';
    })
    .join('\n');
}

function cleanTerminalLine(line: string): string {
  const withoutPromptPrefix = stripDecoratedPromptPrefix(line.trimEnd());

  return withoutPromptPrefix
    .replace(/^\s*[>›❯]\s*/, '')
    .replace(/^\s*●\s*/, '')
    .trimEnd();
}

function stripDecoratedPromptPrefix(line: string): string {
  const cleaned = line.replace(/^[▘▝▗▖\s]+/u, '');
  const answerMarkerIndex = cleaned.indexOf('●');

  // "C:\...\❯ question●answer" → keep only from the answer marker
  if (answerMarkerIndex >= 0 && /^[A-Z]:\\.*[>❯]/.test(cleaned.slice(0, answerMarkerIndex))) {
    return cleaned.slice(answerMarkerIndex);
  }

  // "C:\...\❯ question" (echoed Claude prompt, no answer marker) → drop the path prompt.
  // Only the ❯ form, NOT the cmd.exe ">" form (where the rest is a shell command).
  if (answerMarkerIndex < 0 && /^[A-Z]:\\[^\n]*❯/.test(cleaned)) {
    return cleaned.replace(/^[A-Z]:\\[^❯\n]*❯\s*/u, '');
  }

  return cleaned;
}

function isShellPromptLine(value: string): boolean {
  return /^[A-Z]:\\[^\n]*[>❯]/.test(value.replace(/^[▘▝▗▖\s]+/u, ''));
}

function isTerminalUiLine(trimmed: string): boolean {
  if (!trimmed) {
    return true;
  }

  return [
    /^[A-Z]:\\.*>/,
    /^Microsoft Windows \[/,
    /^\(c\) Microsoft Corporation/,
    /^Claude Code v/,
    /^Welcome back!?$/i,
    /^Tips for getting started/i,
    /^What's new/i,
    /^Run \/init/i,
    /^new\b/i,
    /^model\b/i,
    /^help\b/i,
    /^exit\b/i,
    /^clear\b/i,
    /^login\b/i,
    /^logout\b/i,
    /^status\b/i,
    /^config\b/i,
    /^settings\b/i,
    /^init\b/i,
    /^resume\b/i,
    /^continue\b/i,
    /^compact\b/i,
    /^review\b/i,
    /^install\b/i,
    /^memory\b/i,
    /^doctor\b/i,
    /^bug\b/i,
    /^release-notes\b/i,
    /^[/\\]?release-notes/i,
    /^gpt-[\w.-]+\s+with\s+/i,
    /^model\s+(changed|switched)/i,
    /^switched\s+(to|model)/i,
    /^\/model\b/i,
    /^API Usage/i,
    /^Billing/i,
    /Resume\s*session/i,
    /^\(\s*\d+\s*of\s*\d+\s*\)/i,
    /Search(?:\.\.\.|…)/i,
    /\bHEAD[·:\s-]*\d+(?:\.\d+)?\s*KB/i,
    /(?:^|\s)\d+\s*(?:minutes?|hours?|days?)\s*ago[·\s-]*HEAD/i,
    /(?:Space to preview|Space\s*preview|Spacpreview|Ctrl\+B to only show current batch|Ctrl\+R to rename|Type to search|Esc to cancel)/i,
    /^[\s\-─━═╭╮╰╯│┃┌┐└┘├┤┬┴┼╎╏]+$/,
    /^[*✻✽✶✳✢·•]\s*(Baked|Wonked|Thought|Used|Interrupted|Galloping|Worked)\b/i,
    /^Thought for/i,
    /^Baked for/i,
    /^Wonked for/i,
    /^Worked for/i,
    /^Galloping/i,
    /^⎿\s*Tip:/i,
    /^\?\s+for shortcuts/i,
    /^[-─━═]{5,}$/
  ].some((pattern) => pattern.test(trimmed));
}

function isUserInputLine(trimmed: string): boolean {
  return /^输出一个/.test(trimmed)
    || /^使用\$?$/.test(trimmed)
    || /^模型$/.test(trimmed)
    || /^claude\b/i.test(trimmed);
}

function isPromptLine(trimmed: string): boolean {
  return /^[>›❯]\s*$/.test(trimmed) || /^\?\s+for shortcuts/i.test(trimmed);
}

function looksLikeAiAnswerLine(trimmed: string): boolean {
  return /[一-鿿]/.test(trimmed)
    || /\$[^$]+\$/.test(trimmed)
    || /\\\[[\s\S]*?\\\]/.test(trimmed)
    || /\$\$/.test(trimmed)
    || /^#{1,6}\s+/.test(trimmed)
    || /^[-*+]\s+/.test(trimmed)
    || /^\d+\.\s+/.test(trimmed)
    || /^```/.test(trimmed);
}

function createTitle(content: string, index: number): string {
  const withoutMathBlocks = content.replace(/\$\$[\s\S]*?\$\$/g, '[公式]');
  const firstLine = withoutMathBlocks.split(/[。\n]/).find((line) => line.trim())?.trim();
  if (!firstLine) {
    return `Answer ${index}`;
  }

  return firstLine.length > 36 ? `${firstLine.slice(0, 36)}…` : firstLine;
}

function createExcerpt(content: string): string {
  const plain = content
    .replace(/\$\$[\s\S]*?\$\$/g, '[公式]')
    .replace(/\$([^$]+)\$/g, '$1')
    .replace(/[#*_`>\-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  return plain.length > 60 ? `${plain.slice(0, 60)}…` : plain;
}

function cleanPromptTitle(prompt: string): string {
  return stripAnsi(prompt)
    .replace(/\r/g, '').replace(/\n/g, ' ')
    .replace(/^[▘▝▗▖\s]+/u, '')
    .replace(/^[A-Z]:\\[^❯>]*[>❯]\s*/u, '')
    .replace(/^\s*[>›❯]\s*/, '')
    .trim();
}

function trimBlankLines(lines: string[]): string[] {
  let start = 0;
  let end = lines.length;

  while (start < end && !lines[start]?.trim()) {
    start += 1;
  }

  while (end > start && !lines[end - 1]?.trim()) {
    end -= 1;
  }

  return lines.slice(start, end);
}

function stripAnsi(value: string): string {
  return value
    .replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, '')
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/\x1b[()][A-Za-z0-9]/g, '')
    .replace(/\x1b[@-~]/g, '');
}
