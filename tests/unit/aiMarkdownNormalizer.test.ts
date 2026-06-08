import { describe, expect, it } from 'vitest';
import { normalizeAiMarkdown } from '../../src/renderer/aiMarkdownNormalizer';

describe('normalizeAiMarkdown', () => {
  it('adds paragraph breaks after Chinese full stops', () => {
    const normalized = normalizeAiMarkdown('第一句。第二句。');

    expect(normalized).toContain('第一句。\n\n第二句。');
  });

  it('normalizes Chinese colon list syntax', () => {
    const normalized = normalizeAiMarkdown('其中：- $x$ 是空间位置 - $d$ 是观察方向');

    expect(normalized).toContain('其中：\n- $x$ 是空间位置');
    expect(normalized).toContain('\n- $d$ 是观察方向');
  });

  it('preserves single-line single-dollar math as inline math', () => {
    const normalized = normalizeAiMarkdown('公式如下：\n$G(x)=e^{-x}$\n其中：');

    expect(normalized).toContain('$G(x)=e^{-x}$');
    expect(normalized).not.toContain('$$\nG(x)=e^{-x}\n$$');
  });

  it('converts single-dollar lines to display math', () => {
    const normalized = normalizeAiMarkdown(`公式如下：
$
G(x)=e^{-x}
$
其中：`);

    expect(normalized).toContain('$$\nG(x)=e^{-x}\n$$');
  });

  it('converts standalone bracket math to display math', () => {
    const normalized = normalizeAiMarkdown('欧拉公式：\n[\ne^{ix}=\\cos x+i\\sin x\n]');

    expect(normalized).toContain('$$\ne^{ix}=\\cos x+i\\sin x\n$$');
  });

  it('preserves multiline double-dollar math fences', () => {
    const normalized = normalizeAiMarkdown(`公式如下：
$$
A=\\begin{pmatrix}
1 & 0
0 & 1
\\end{pmatrix}
$$
因为它们相乘等于单位矩阵。`);

    expect(normalized).toContain('$$\nA=\\begin{pmatrix}');
    expect(normalized).toContain('\\end{pmatrix}\n$$');
    expect(normalized).not.toContain('\n$\nA=');
  });

  it('joins inline math wrapped across terminal lines', () => {
    const normalized = normalizeAiMarkdown('则 $A^+=(A^TA)^{-1}\nA^T$ 是左逆。');

    expect(normalized).toContain('$A^+=(A^TA)^{-1} A^T$');
    expect(normalized).not.toContain('}^{-1}\nA');
  });

  it('does not merge two separate inline math spans', () => {
    const normalized = normalizeAiMarkdown('设 $x$ 与 $y$ 满足条件。');

    expect(normalized).toContain('$x$');
    expect(normalized).toContain('$y$');
  });

  it('keeps display math blocks intact when wrapping bare LaTeX commands', () => {
    const normalized = normalizeAiMarkdown(String.raw`如果写完整的归一化高斯形式，则是：
$G(\mathbf{x})=\frac{1}{(2\pi)^{3/2}|\boldsymbol{\Sigma}|^{1/2}}\exp\left(-\frac{1}{2}(\mathbf{x}-\boldsymbol{\mu})^T\boldsymbol{\Sigma}^{-1}(\mathbf{x}-\boldsymbol{\mu})\right)$
不过在 3DGS 渲染中，通常更关注指数部分。`);

    expect(normalized).toContain('$$\nG(\\mathbf{x})=');
    expect(normalized).toContain('\\right)\n$$');
    expect(normalized).not.toContain('$\\boldsymbol{\\Sigma}$');
  });

  it('uses display math for standalone long inline formulas', () => {
    const normalized = normalizeAiMarkdown(String.raw`公式：
$G(\mathbf{x})=\exp\left(-\frac{1}{2}(\mathbf{x}-\boldsymbol{\mu})^T\boldsymbol{\Sigma}^{-1}(\mathbf{x}-\boldsymbol{\mu})\right)$
其中：`);

    expect(normalized).toContain('$$\nG(\\mathbf{x})=');
    expect(normalized).not.toContain('$G(\\mathbf{x})=');
  });
});
