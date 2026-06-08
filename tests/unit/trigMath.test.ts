import { describe, it, expect } from 'vitest';
import { renderMarkdown } from '../../src/renderer/markdownRenderer';

describe('trig and common functions', () => {
  it('renders \sin inline', () => {
    const html = renderMarkdown('$\sin(x)$');
    expect(html).toContain('katex');
    expect(html).not.toContain('katex-error');
    expect(html).not.toContain('color:#cc0000');
  });
  it('renders \sin^2 + \cos^2 = 1', () => {
    const html = renderMarkdown('$$\sin^2\theta + \cos^2\theta = 1$$');
    expect(html).toContain('katex-display');
    expect(html).not.toContain('katex-error');
  });
  it('renders \lim with \sin', () => {
    const html = renderMarkdown('$$\lim_{x \to 0} \frac{\sin x}{x} = 1$$');
    expect(html).toContain('katex-display');
    expect(html).not.toContain('katex-error');
  });
  it('renders multiline with \sin (the buggy case)', () => {
    const html = renderMarkdown('$$\n\sin(x)\n\cos(x)\n$$');
    expect(html).toContain('katex-display');
    expect(html).not.toContain('katex-error');
    expect(html).not.toContain('color:#cc0000');
  });
  it('renders ASCII tab-damaged \\times from copied terminal output', () => {
    const html = renderMarkdown('$a \times b$');
    expect(html).toContain('katex');
    expect(html).toContain('×');
    expect(html).not.toContain('katex-error');
    expect(html).not.toContain('color:#cc0000');
  });

  it('renders bare common LaTeX commands from terminal output', () => {
    const html = renderMarkdown(String.raw`这个渲染失败：\ldots 和 \times`);
    expect(html).toContain('katex');
    expect(html).toContain('…');
    expect(html).toContain('×');
    expect(html).not.toContain('katex-error');
    expect(html).not.toContain('color:#cc0000');
  });

  it('repairs dropped spaces after common LaTeX commands from terminal output', () => {
    const html = renderMarkdown(String.raw`$a \timesb \ldotsc$`);
    expect(html).toContain('katex');
    expect(html).toContain('×');
    expect(html).toContain('…');
    expect(html).not.toContain('katex-error');
    expect(html).not.toContain('color:#cc0000');
  });
});
