import { normalizeMathDelimiters } from './mathNormalizer';

export function normalizeAiMarkdown(source: string): string {
  let text = normalizeMathDelimiters(source);

  text = normalizeStandaloneDollarMath(text);
  text = normalizeStandaloneBracketMath(text);
  text = normalizeStandaloneFormulaLines(text);
  text = wrapBareLaTeXCommands(text);
  text = joinWrappedInlineMath(text);
  text = normalizeInlineBracketMath(text);
  text = normalizeChineseLists(text);
  text = normalizeNumberedSections(text);
  text = normalizeParagraphs(text);
  text = normalizeFormulaSpacing(text);

  return text.trim();
}

function normalizeStandaloneDollarMath(source: string): string {
  return source.replace(/(^|\n)\s*\$\s*\n([\s\S]*?)\n\s*\$\s*(?=\n|$)/g, (_match, prefix: string, math: string) => {
    return `${prefix}$\n${math.trim()}\n$`;
  });
}

function normalizeStandaloneBracketMath(source: string): string {
  return source.replace(/(^|\n)\s*\[\s*\n([\s\S]*?)\n\s*\]\s*(?=\n|$)/g, (_match, prefix: string, math: string) => {
    return `${prefix}\n$\n${math.trim()}\n$\n`;
  });
}

function normalizeStandaloneFormulaLines(source: string): string {
  return source.split('\n').map((line) => {
    const trimmed = line.trim();
    if (!isStandaloneFormulaLine(trimmed)) {
      return line;
    }

    return `$\n${trimmed.slice(1, -1).trim()}\n$`;
  }).join('\n');
}

function isStandaloneFormulaLine(line: string): boolean {
  if (!/^\$(?!\$)[\s\S]+\$(?!\$)$/.test(line)) {
    return false;
  }

  const inner = line.slice(1, -1).trim();
  if (!inner || inner.includes('\n')) {
    return false;
  }

  return inner.length > 48
    || /\\begin\{/.test(inner)
    || /\\(?:frac|left|right|exp|sum|prod|int|mathbb|boldsymbol|mathbf|mathcal)\b/.test(inner);
}

// A long inline $...$ formula can be wrapped by the terminal onto two physical
// lines, leaving a newline inside the span. The renderer's inline-math regex
// rejects newlines, so the formula would render as literal "$...$". Collapse
// single newlines that sit inside an inline span. Standalone "$" display
// blocks are left untouched.
function joinWrappedInlineMath(source: string): string {
  return source.replace(/(^|[^$\n])\$([^$]*?\n[^$]*?)\$(?!\$)/g, (match, prefix: string, inner: string) => {
    if (inner.includes('$') || /\n\s*\n/.test(inner)) {
      return match;
    }
    const joined = inner.replace(/\s*\n\s*/g, ' ').trim();
    return `${prefix}$${joined}$`;
  });
}

// Wrap bare LaTeX commands that appear after Chinese text/punctuation or at line start,
// but are NOT already inside a $ ... $ span.
// e.g. "均值为 \boldsymbol{\mu}" → "均值为 $\boldsymbol{\mu}$"
function wrapBareLaTeXCommands(source: string): string {
  let insideDisplayMath = false;

  return source.split('\n').map((line) => {
    if (/^\s*\$\$\s*$/.test(line)) {
      insideDisplayMath = !insideDisplayMath;
      return line;
    }

    // Skip lines that are already in math delimiters.
    if (insideDisplayMath || line.includes('$')) return line;
    // Only wrap if line contains a known font/decoration command.
    if (!/\\(?:boldsymbol|mathbf|mathbb|mathcal|mathit|mathrm|bm|vec|hat|bar|tilde|overline)\{/.test(line)) return line;

    return line.replace(
      /((?:\\(?:boldsymbol|mathbf|mathbb|mathcal|mathit|mathrm|bm|vec|hat|bar|tilde|overline)\{[^}]*\})(?:\s*(?:\\[a-zA-Z]+(?:\{[^}]*\})?|\^[\{]?[^\s}]+[\}]?|_[\{]?[^\s}]+[\}]?))*)/g,
      (match) => `$${match.trim()}$`
    );
  }).join('\n');
}

function normalizeInlineBracketMath(source: string): string {
  return source.replace(/\[([^\[\]\n]+)\]/g, (match, inner: string) => {
    return looksLikeMath(inner) ? `$${inner.trim()}$` : match;
  });
}

function normalizeChineseLists(source: string): string {
  return source
    .replace(/(^|\n)\s*\$\$\s*\n([\s\S]*?)\n\s*\$\$\s*(?=\n|$)/g, (_match, prefix: string, math: string) => `${prefix}\n§§DISPLAY§§\n${math.trim()}\n§§DISPLAY§§\n`)
    .replace(/([：:])\s*-\s+/g, '$1\n\n- ')
    .replace(/([^\n])\s+-\s+(?=(?:\$|\\\(|[A-Za-z0-9_一-鿿]))/g, '$1\n- ');
}

function normalizeNumberedSections(source: string): string {
  return source
    .replace(/(?:^|\n)\s*---\s*(\d+\.\s+[^\n。:：]+)\s+/g, '\n\n## $1\n\n')
    .replace(/(?:^|\n)\s*(\d+\.\s+[^\n。:：]{2,36})\n(?=[一-鿿A-Za-z])/g, '\n\n## $1\n\n');
}

function normalizeParagraphs(source: string): string {
  return source
    .replace(/。(?=\S)/g, '。\n\n')
    .replace(/([。！？])\s+(?=[一-鿿])/g, '$1\n\n')
    // Chinese colon at end of line followed immediately by content → insert blank line
    .replace(/([：:。！？])\n(?!\n)(?=[^\s\-*#$\\])/g, '$1\n\n')
    // Non-empty line followed by a line starting with $ (math block) → blank line between
    .replace(/([^\n$])\n(\$(?!\$))/g, '$1\n\n$2')
    // Line ending with $ (closing inline math) followed by Chinese text → blank line
    .replace(/(\$)\n(?!\n)(?=[一-鿿])/g, '$1\n\n');
}

function normalizeFormulaSpacing(source: string): string {
  return source
    .replace(/([^\n])\n?\$\$\n/g, '$1\n\n$$\n')
    .replace(/\n\$\$\n([^\n])/g, '\n$$\n$1')
    .replace(/\n\$\$([^\n])/g, '\n$$\n$1')
    .replace(/([^\n])\$\$/g, '$1\n$$')
    .replace(/\$\$\n([^\n]*?)\n\$\$/g, '$$\n$1\n$$')
    .replace(/\$\$(?=\n[^\n])/g, '$$\n')
    .replace(/\$\$\n/g, '$$\n')
    .replace(/§§DISPLAY§§/g, '$$$$')
    .replace(/\n{3,}/g, '\n\n');
}

function looksLikeMath(value: string): boolean {
  const text = value.trim();

  if (!text || text.length > 160) {
    return false;
  }

  if (!/\\[a-zA-Z]/.test(text)) {
    return false;
  }

  // Pure commands with no operators are still math (e.g. \boldsymbol{\Sigma})
  return /[=^_+*/]|\d/.test(text) || /\\(?:boldsymbol|mathbf|mathbb|mathcal|mathit|mathrm|bm|vec|hat|bar|tilde|dot|ddot|overline|underline|text)\{/.test(text);
}
