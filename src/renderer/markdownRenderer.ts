import MarkdownIt from 'markdown-it';
import createDOMPurify from 'dompurify';
import katex from 'katex';

const DOMPurify = typeof window !== 'undefined' ? createDOMPurify(window) : null;
import { MATRIX_ENVS, normalizeMathDelimiters, normalizeMathSource } from './mathNormalizer';

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
  const normalizedMath = normalizeWrappedInlineMath(
    normalizeMathDelimiters(normalized)
      .replace(/(?:^|\n)\s*\$\s*\n([\s\S]*?)\n\s*\$\s*(?=\n|$)/g, (_m, s) => placeDisplay(s))
  );

  const prepared = normalizedMath
    // $$\n...\n$$ (allow optional blank lines after opening $$)
    .replace(/\$\$\n?\n?([\s\S]*?)\n?\n?\$\$/g, (_m, s) => placeDisplay(s))
    // $$...$$
    .replace(/\$\$([^$]+?)\$\$/g, (_m, s) => placeDisplay(s))
    // \[...\]
    .replace(/\\\[([\s\S]*?)\\\]/g, (_m, s) => placeDisplay(s))
    // $...\begin{matrix}...\end{matrix}...$ — must come BEFORE standalone \begin display
    .replace(new RegExp(`\\$([^$]*?\\\\begin\\{(?:${MATRIX_ENVS})\\}[\\s\\S]*?\\\\end\\{(?:${MATRIX_ENVS})\\}(?:(?!${DISPLAY_MATH_PLACEHOLDER}|${INLINE_MATH_PLACEHOLDER})[^$])*)\\$`, 'g'), (_m, s) => placeInline(s))
    // \begin{equation/align/matrix/...} standalone (not wrapped in $)
    .replace(/\\begin\{(equation\*?|align\*?|gather\*?|multline\*?|bmatrix|pmatrix|matrix|vmatrix|Vmatrix|Bmatrix|array)\}([\s\S]*?)\\end\{\1\}/g, (_m, _e, s) => placeDisplay(s))
    // \(...\)
    .replace(/\\\((.+?)\\\)/gs, (_m, s) => placeInline(s))
    // $...$
    .replace(/(?<!\$)\$([^$\n]+?)\$(?!\$)/g, (_m, s) => placeInline(s))
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

function normalizeWrappedInlineMath(source: string): string {
  return source.replace(/(^|[^$\n])\$([^$]*?\n[^$]*?)\$(?!\$)/g, (match, prefix: string, inner: string) => {
    if (inner.includes('$') || /\n\s*\n/.test(inner)) {
      return match;
    }

    const joined = inner
      .replace(/\\([A-Za-z]{1,12})\s*\n\s*([A-Za-z]{2,12})(?=\b|\{)/g, (_m, left: string, right: string) => `\\${left}${right}`)
      .replace(/\s*\n\s*/g, ' ')
      .trim();
    return `${prefix}$${joined}$`;
  });
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
