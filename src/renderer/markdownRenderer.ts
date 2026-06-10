import MarkdownIt from 'markdown-it';
import createDOMPurify from 'dompurify';
import katex from 'katex';

const DOMPurify = typeof window !== 'undefined' ? createDOMPurify(window) : null;
import { normalizeMathDelimiters, normalizeMathSource } from './mathNormalizer';

const DISPLAY_MATH_PLACEHOLDER = 'DISPLAY_MATH_';
const INLINE_MATH_PLACEHOLDER = 'INLINE_MATH_';

const markdown = new MarkdownIt({
  html: false,
  linkify: false,
  typographer: false,
  breaks: true
});

const defaultValidateLink = markdown.validateLink.bind(markdown);
markdown.validateLink = (url: string): boolean => {
  return /^file:\/\//i.test(url) || defaultValidateLink(url);
};

export function renderMarkdown(source: string): string {
  return renderPreparedMarkdown(source, new Map());
}

export async function renderMarkdownAsync(source: string): Promise<string> {
  const resolver = typeof window !== 'undefined' ? window.imageApi?.resolve : undefined;
  if (!resolver) {
    return renderMarkdown(source);
  }

  const imageSources = collectLocalImageSources(source);
  if (imageSources.length === 0) {
    return renderMarkdown(source);
  }

  const resolvedImages = await resolveImageSources(imageSources, resolver);
  return renderPreparedMarkdown(source, resolvedImages);
}

function renderPreparedMarkdown(source: string, resolvedImages: Map<string, string>): string {
  const renderedMath: string[] = [];

  function placeDisplay(mathSource: string): string {
    const index = renderedMath.push(renderMathSource(mathSource, true)) - 1;
    return `\n\n${DISPLAY_MATH_PLACEHOLDER}${index}X\n\n`;
  }

  function placeInline(mathSource: string): string {
    const index = renderedMath.push(renderMathSource(mathSource, false)) - 1;
    return `${INLINE_MATH_PLACEHOLDER}${index}X`;
  }

  // Normalize standalone $ ... $ blocks (dollar alone on its own line)
  const normalized = prepareLocalImages(source, resolvedImages);
  const delimiterNormalized = normalizeMathDelimiters(normalized);
  const normalizedMath = replaceStandaloneDollarBlocks(delimiterNormalized, placeDisplay);

  const preparedMath = replaceSingleDollarMathSpans(
    replaceSingleDollarLineMath(
      normalizedMath
        // $$\n...\n$$ (allow optional blank lines after opening $$)
        .replace(/\$\$\n?\n?([\s\S]*?)\n?\n?\$\$/g, (_m, s) => placeDisplay(s))
        // $$...$$
        .replace(/\$\$([^$]+?)\$\$/g, (_m, s) => placeDisplay(s))
        // \[...\]
        .replace(/\\\[([\s\S]*?)\\\]/g, (_m, s) => placeDisplay(s)),
      placeInline
    ),
    placeInline
  );

  const prepared = replaceBareMathEnvironments(preparedMath, placeDisplay)
    // \(...\)
    .replace(/\\\((.+?)\\\)/gs, (_m, s) => placeInline(s))
    // bare \times / \ldots outside any math delimiters (tab-damaged or unwrapped)
    .replace(/(?:^|(?<=\s|[^\w\\]))(?:\\times\b|\x09imes\b)/g, (m) => placeInline(m.trim() === '\times' || m.includes('imes') ? '\\times' : m))
    .replace(/(?:\\ldots\b)/g, (m) => placeInline(m));

  let html = markdown.render(prepared);

  renderedMath.forEach((mathHtml, index) => {
    html = html
      .replaceAll(`${DISPLAY_MATH_PLACEHOLDER}${index}X`, mathHtml)
      .replaceAll(`${INLINE_MATH_PLACEHOLDER}${index}X`, mathHtml);
  });

  return DOMPurify
    ? DOMPurify.sanitize(html, { ADD_TAGS: ['math', 'svg'], ADD_ATTR: ['xmlns', 'viewBox', 'src', 'alt', 'title'] })
    : html;
}

function replaceSingleDollarLineMath(source: string, placeInline: (mathSource: string) => string): string {
  return source.split('\n').map((line) => {
    const match = line.match(/^([ \t]*)\$(?!\$)([^$\n]+)\$(?!\$)([ \t]*)$/);
    if (!match) {
      return line;
    }

    return `${match[1]}${placeInline(match[2] ?? '')}${match[3]}`;
  }).join('\n');
}

function replaceStandaloneDollarBlocks(source: string, placeDisplay: (mathSource: string) => string): string {
  const lines = source.split('\n');
  const output: string[] = [];
  let blockLines: string[] | null = null;

  for (const line of lines) {
    if (/^[ \t]*\$[ \t]*$/.test(line)) {
      if (blockLines === null) {
        blockLines = [];
      } else {
        output.push(placeDisplay(blockLines.join('\n')));
        blockLines = null;
      }
      continue;
    }

    if (blockLines !== null) {
      blockLines.push(line);
      continue;
    }

    output.push(line);
  }

  if (blockLines !== null) {
    output.push('$', ...blockLines);
  }

  return output.join('\n');
}

function replaceBareMathEnvironments(source: string, placeDisplay: (mathSource: string) => string): string {
  return source.replace(
    /\\begin\{(equation\*?|align\*?|gather\*?|multline\*?|bmatrix|pmatrix|matrix|vmatrix|Vmatrix|Bmatrix|array)\}([\s\S]*?)\\end\{\1\}/g,
    (match: string, _environment: string, _body: string, offset: number) => {
      const before = source.slice(0, offset);
      const singleDollarCount = (before.match(/(?<!\$)\$(?!\$)/g) ?? []).length;
      if (singleDollarCount % 2 === 1) {
        return match;
      }

      return placeDisplay(match);
    }
  );
}

function replaceSingleDollarMathSpans(source: string, placeInline: (mathSource: string) => string): string {
  let result = '';
  let cursor = 0;

  while (cursor < source.length) {
    const start = source.indexOf('$', cursor);
    if (start === -1) {
      result += source.slice(cursor);
      break;
    }

    if (source[start - 1] === '$' || source[start + 1] === '$') {
      result += source.slice(cursor, start + 1);
      cursor = start + 1;
      continue;
    }

    const end = source.indexOf('$', start + 1);
    if (end === -1) {
      result += source.slice(cursor);
      break;
    }

    if (source[end - 1] === '$' || source[end + 1] === '$') {
      result += source.slice(cursor, end + 1);
      cursor = end + 1;
      continue;
    }

    const mathSource = source.slice(start + 1, end);
    if (!mathSource.trim()
      || /\n\s*\n/.test(mathSource)
      || mathSource.includes(DISPLAY_MATH_PLACEHOLDER)
      || mathSource.includes(INLINE_MATH_PLACEHOLDER)) {
      result += source.slice(cursor, start + 1);
      cursor = start + 1;
      continue;
    }

    result += source.slice(cursor, start) + placeInline(mathSource);
    cursor = end + 1;
  }

  return result;
}

function collectLocalImageSources(source: string): string[] {
  const sources = new Set<string>();

  source.replace(/!\[[^\]\n]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (_match, imageSource: string) => {
    if (isLocalImageReference(imageSource)) {
      sources.add(imageSource);
    }
    return _match;
  });

  source.replace(/(?:^|\s)@([^\s]+\.(?:apng|avif|gif|jpe?g|png|svg|webp))\b/gi, (_match, imageSource: string) => {
    if (isLocalImageReference(imageSource)) {
      sources.add(imageSource);
    }
    return _match;
  });

  return [...sources];
}

async function resolveImageSources(
  sources: string[],
  resolveImage: (source: string) => Promise<string | null>
): Promise<Map<string, string>> {
  const entries = await Promise.all(sources.map(async (source) => [source, await resolveImage(source)] as const));
  return new Map(entries.filter((entry): entry is readonly [string, string] => entry[1] !== null));
}

function prepareLocalImages(source: string, resolvedImages: Map<string, string>): string {
  return source
    .replace(/!\[([^\]\n]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g, (match, alt: string, imageSource: string, title: string | undefined) => {
      const resolved = resolvedImages.get(imageSource);
      if (!resolved) {
        return match;
      }

      return `![${alt}](${resolved}${title ? ` "${title}"` : ''})`;
    })
    .replace(/(^|\s)@([^\s]+\.(?:apng|avif|gif|jpe?g|png|svg|webp))\b/gi, (match, prefix: string, imageSource: string) => {
      const resolved = resolvedImages.get(imageSource);
      if (!resolved) {
        return match;
      }

      return `${prefix}![${imageSource}](${resolved})`;
    });
}

function isLocalImageReference(source: string): boolean {
  return !/^(?:https?:|data:|file:)/i.test(source);
}

function renderMathSource(source: string, displayMode: boolean): string {
  const normalized = normalizeMathSource(source);
  if (normalized.includes('egin{') || normalized.includes('nd{v')) {
    console.log('[MATH_DEBUG] raw source:', JSON.stringify(source.substring(0, 300)));
    console.log('[MATH_DEBUG] normalized:', JSON.stringify(normalized.substring(0, 300)));
  }
  try {
    return katex.renderToString(normalized, {
      displayMode,
      throwOnError: false,
      strict: false,
      trust: true,
      macros: {
        '\\R': '\\mathbb{R}',
        '\\Z': '\\mathbb{Z}',
        '\\N': '\\mathbb{N}',
        '\\C': '\\mathbb{C}',
        '\\Q': '\\mathbb{Q}',
        '\\norm': '\\left\\lVert#1\\right\\rVert',
        '\\abs': '\\left|#1\\right|',
        '\\floor': '\\left\\lfloor#1\\right\\rfloor',
        '\\ceil': '\\left\\lceil#1\\right\\rceil',
        '\\d': '\\,\\mathrm{d}',
        '\\T': '^{\\top}',
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown KaTeX render error';
    return `<pre class="markdown-render-error">KaTeX error: ${escapeHtml(message)}</pre>`;
  }
}

export function terminalOutputToMarkdown(rawOutput: string): string {
  return stripAnsi(rawOutput)
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => shouldKeepPreviewLine(line))
    .map(cleanPreviewLine)
    .join('\n');
}

function shouldKeepPreviewLine(line: string): boolean {
  const trimmed = line.trim();

  if (!trimmed) {
    return true;
  }

  if (/^[A-Z]:\\.*>[A-Za-z].*/.test(trimmed)) {
    return false;
  }

  if (/^Microsoft Windows \[/.test(trimmed)) {
    return false;
  }

  if (/^\(c\) Microsoft Corporation/.test(trimmed)) {
    return false;
  }

  if (/^Claude Code v/.test(trimmed)) {
    return false;
  }

  if (/^[*✻✽✶✳✢·•]\s*(Baked|Wonked|Thought|Used|Interrupted)\b/i.test(trimmed)) {
    return false;
  }

  if (/^[>›❯]\s*$/.test(trimmed)) {
    return false;
  }

  if (/^\?\s+for shortcuts/.test(trimmed)) {
    return false;
  }

  if (/^[-─━═]{5,}$/.test(trimmed)) {
    return false;
  }

  return true;
}

function cleanPreviewLine(line: string): string {
  return line
    .replace(/^[>›❯]\s*/, '')
    .replace(/^●\s*/, '')
    .replace(/^\s*使用\$\s*$/, '')
    .replace(/^\s*输出一个你最喜欢的数学公式\s*$/, '')
    .trimEnd();
}

function stripAnsi(value: string): string {
  return value
    .replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, '')
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/\x1b[()][A-Za-z0-9]/g, '')
    .replace(/\x1b[@-~]/g, '');
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
