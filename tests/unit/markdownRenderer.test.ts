import { describe, expect, it, vi } from 'vitest';
import { renderMarkdown, renderMarkdownAsync, terminalOutputToMarkdown } from '../../src/renderer/markdownRenderer';

describe('renderMarkdown', () => {
  it('renders basic markdown', () => {
    const html = renderMarkdown('# Result\n\n- item');

    expect(html).toContain('<h1>Result</h1>');
    expect(html).toContain('<li>item</li>');
  });

  it('renders block math with KaTeX', () => {
    const html = renderMarkdown('$$E=mc^2$$');

    expect(html).toContain('katex');
    expect(html).toContain('m');
  });

  it('renders bracket display math with KaTeX', () => {
    const html = renderMarkdown('\\[e^{i\\pi}+1=0\\]');

    expect(html).toContain('katex');
    expect(html).toContain('π');
  });

  it('renders single-line single-dollar math as inline math', () => {
    const html = renderMarkdown('Before\n\n$G(x)=e^{-\\frac{1}{2}(x-\\mu)^T\\Sigma^{-1}(x-\\mu)}$\n\nAfter');

    expect(html).toContain('katex');
    expect(html).not.toContain('katex-display');
    expect(html).toContain('G');
  });

  it('renders single-dollar lines as display math', () => {
    const html = renderMarkdown(`Before

$
G(x)=e^{-\\frac{1}{2}(x-\\mu)^T\\Sigma^{-1}(x-\\mu)}
$

After`);

    expect(html).toContain('katex-display');
    expect(html).toContain('G');
  });

  it('renders inline math with KaTeX', () => {
    const html = renderMarkdown('Euler: $e^{i\\pi}+1=0$');

    expect(html).toContain('katex');
    expect(html).toContain('Euler');
  });

  it('renders parenthesized LaTeX inline math delimiters', () => {
    const html = renderMarkdown('Euler: \\(e^{i\\pi}+1=0\\)');

    expect(html).toContain('katex');
    expect(html).toContain('Euler');
    expect(html).not.toContain('\\(');
    expect(html).not.toContain('\\)');
  });

  it('does not insert equals before structural display commands', () => {
    const html = renderMarkdown(`$$
\\boxed{
\\alpha_i
G'_i(\\mathbf{p})
\\prod_{j<i}
\\left(
1-\\alpha_jG'_j(\\mathbf{p})
\\right)
}
$$`);

    expect(html).toContain('katex-display');
    expect(html).toContain('boxpad');
    expect(html).not.toContain('katex-error');
    expect(html).not.toContain('color:#cc0000');
  });

  it('converts terminal output into preview markdown', () => {
    const markdown = terminalOutputToMarkdown('Microsoft Windows [版本 10]\r\nC:\\x>claude\r\n● $e^{i\\pi}+1=0$\r\n');

    expect(markdown).not.toContain('Microsoft Windows');
    expect(markdown).toContain('$e^{i\\pi}+1=0$');
  });

  it('renders malformed single-backslash bmatrix rows from AI output', () => {
    const html = renderMarkdown('$C=\\begin{bmatrix}C_{11}&C_{12}&\\cdots&C_{1n}\\C_{21}&C_{22}&\\cdots&C_{2n}\\vdots&\\vdots&\\ddots&\\vdots\\C_{n1}&C_{n2}&\\cdots&C_{nn}\\end{bmatrix}$');

    expect(html).toContain('katex');
    expect(html).toContain('mtable');
  });

  it('repairs single-backslash letter row starts in matrices', () => {
    const html = renderMarkdown('$A=\\begin{pmatrix}a&b\\c&d\\end{pmatrix}$');

    expect(html).toContain('katex');
    expect(html).toContain('mtable');
    expect(html).not.toContain('katex-error');
    expect(html).not.toContain('color:#cc0000');
  });

  it('keeps valid matrix commands while repairing letter row starts', () => {
    const html = renderMarkdown('$C=\\begin{bmatrix}C_{11}&C_{12}&\\cdots&C_{1n}\\C_{21}&C_{22}&\\cdots&C_{2n}\\end{bmatrix}$');

    expect(html).toContain('katex');
    expect(html).toContain('mtable');
    expect(html).not.toContain('katex-error');
    expect(html).not.toContain('color:#cc0000');
  });

  it('renders newline-separated bmatrix rows as matrix rows', () => {
    const html = renderMarkdown(`$R =
\\begin{bmatrix}
5 & ? & 3
4 & 2 & ?
? & 5 & 4
\\end{bmatrix}$`);

    expect(html).toContain('katex');
    expect(html).toContain('mtable');
  });

  it('repairs missing opening dollar before arrow function math', () => {
    const html = renderMarkdown('F(x, d) \\rightarrow (\\sigma, c)$ 其中 $x$ 是空间位置');

    expect(html).toContain('katex');
    expect(html).toContain('其中');
  });

  it('repairs unclosed matrix math followed by punctuation', () => {
    const html = renderMarkdown('$S_i = \\begin{bmatrix}s_{x,i} & 0 & 0\\\\ \\\\ 0 & s_{y,i} & 0\\\\ \\\\ 0 & 0 & s_{z,i}\\end{bmatrix}，最后修复');

    expect(html).toContain('katex');
    expect(html).toContain('mtable');
    expect(html).toContain('最后修复');
  });

  it('renders multiline double-dollar display math with blank lines', () => {
    const html = renderMarkdown(`$$
G_i(\\mathbf{x})

\\exp
\\left(
-\\frac{1}{2}
(\\mathbf{x}-\\boldsymbol{\\mu}_i)^T
\\Sigma_i^{-1}
(\\mathbf{x}-\\boldsymbol{\\mu}_i)
\\right)
$$`);

    expect(html).toContain('katex-display');
    expect(html).toContain('exp');
    expect(html).not.toContain('katex-error');
  });

  it('renders multiline double-dollar matrix blocks', () => {
    const html = renderMarkdown(`$$
A=\\begin{pmatrix}
1 & -1 & 1 & -1
0 & 1 & -1 & 1
0 & 0 & 1 & -1
0 & 0 & 0 & 1
\\end{pmatrix}
$$`);

    expect(html).toContain('katex-display');
    expect(html).toContain('mtable');
    expect(html).not.toContain('katex-error');
  });

  it('does not merge earlier inline math into a later matrix block', () => {
    const html = renderMarkdown('矩阵不是单位矩阵，因为 $A^{-1}$ 的第一行是 $1 -1 1 -1$，而 $A A^{-1}$ 中第 1 行第 2 列为 $0$。因此 $A^{-1}=\\begin{pmatrix}1&-1&1&-1\\0&1&-1&1\\0&0&1&-1\\0&0&0&1\\end{pmatrix}$');

    expect(html).toContain('矩阵不是单位矩阵');
    expect(html).toContain('mtable');
    expect(html).not.toContain('katex-error');
    expect(html).not.toContain('color:#cc0000');
  });

  it('repairs common AI omissions in boxed splatting formula', () => {
    const html = renderMarkdown(`$$
\\boxed{
\\mathbf{C}(\\mathbf{p})

\\sum_i
\\mathbf{c}_i(\\mathbf{d})
\\alpha_i
G'i(\\mathbf{p})
\\prod{j<i}
\\left(
1-\\alpha_jG'_j(\\mathbf{p})
\\right)
}
$$`);

    expect(html).toContain('katex-display');
    expect(html).toContain('boxpad');
  });

  it('renders resolved local Markdown images', async () => {
    vi.stubGlobal('window', {
      imageApi: {
        resolve: vi.fn(async (source: string) => source === 'app.png' ? 'file:///C:/Users/Taylor/Desktop/teminal/app.png' : null)
      }
    });

    const html = await renderMarkdownAsync('![app](app.png)');

    expect(html).toContain('<img');
    expect(html).toContain('src="file:///C:/Users/Taylor/Desktop/teminal/app.png"');
    expect(html).toContain('alt="app"');

    vi.unstubAllGlobals();
  });

  it('renders resolved @ image shorthand', async () => {
    vi.stubGlobal('window', {
      imageApi: {
        resolve: vi.fn(async (source: string) => source === 'app.png' ? 'file:///C:/Users/Taylor/Desktop/teminal/app.png' : null)
      }
    });

    const html = await renderMarkdownAsync('@app.png');

    expect(html).toContain('<img');
    expect(html).toContain('src="file:///C:/Users/Taylor/Desktop/teminal/app.png"');
    expect(html).toContain('alt="app.png"');

    vi.unstubAllGlobals();
  });

  it('does not render unresolved @ image shorthand as an image', async () => {
    vi.stubGlobal('window', {
      imageApi: {
        resolve: vi.fn(async () => null)
      }
    });

    const html = await renderMarkdownAsync('@missing.png');

    expect(html).not.toContain('<img');
    expect(html).toContain('@missing.png');

    vi.unstubAllGlobals();
  });

  it('does not leak math placeholders into rendered HTML', () => {
    const html = renderMarkdown('矩阵如果： $x$ 则后面有 $y$。');

    expect(html).toContain('katex');
    expect(html).not.toContain('XINLINEX');
    expect(html).not.toContain('INLINE_MATH');
  });

  it('repairs LaTeX commands split by terminal soft wrapping', () => {
    const html = renderMarkdown(String.raw`$G(\mathbf{x})=\exp\left(-\frac{1}{2}(x-\mu)^T\Sigma^{-1}(x-\mu)\rig
ht)$`);

    expect(html).toContain('katex');
    expect(html).not.toContain('katex-error');
    expect(html).not.toContain('\\rig<br>');
    expect(html).not.toContain('\\rig ht');
  });

  it('renders standalone long formulas as separated display math', () => {
    const html = renderMarkdown(String.raw`公式：

$$
G(\mathbf{x})=\exp\left(-\frac{1}{2}(\mathbf{x}-\boldsymbol{\mu})^T\boldsymbol{\Sigma}^{-1}(\mathbf{x}-\boldsymbol{\mu})\right)
$$

其中：`);

    expect(html).toContain('katex-display');
    expect(html).toContain('其中');
    expect(html).not.toContain('katex-error');
  });

  it('renders consecutive single-dollar formulas separately', () => {
    const html = renderMarkdown(String.raw`例如：

$A=\begin{pmatrix}2&3\\1&4\end{pmatrix}$

$|A|=2\cdot4-3\cdot1=8-3=5$

显示效果：

$A=\begin{pmatrix}2&3\\1&4\end{pmatrix}$

$|A|=2\cdot4-3\cdot1=8-3=5$`);

    expect(html).toContain('katex');
    expect(html).toContain('mtable');
    expect(html).not.toContain('katex-error');
    expect(html).not.toContain('color:#cc0000');
    expect(html).toContain('显示效果');
  });

  it('does not render raw HTML as HTML', () => {
    const html = renderMarkdown('<script>alert(1)</script>');

    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
});
