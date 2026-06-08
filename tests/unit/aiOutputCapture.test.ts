import { describe, expect, it } from 'vitest';
import { AiOutputCapture } from '../../src/renderer/aiOutputCapture';

describe('AiOutputCapture', () => {
  it('captures completed AI answer content and hides status lines', () => {
    const capture = new AiOutputCapture();

    capture.push('✻ Thought for 3s\n');
    capture.push('● $e^{i\\pi}+1=0$\n');
    const entries = capture.push('❯\n');

    expect(entries).toHaveLength(1);
    expect(entries[0]?.content).toContain('$e^{i\\pi}+1=0$');
    expect(entries[0]?.normalizedContent).toContain('$e^{i\\pi}+1=0$');
    expect(entries[0]?.content).not.toContain('Thought');
  });

  it('uses the submitted prompt as the history title', () => {
    const capture = new AiOutputCapture();

    capture.setPrompt('解释高斯分布');
    capture.push('高斯分布是一种连续概率分布。\n');
    const entries = capture.push('❯\n');

    expect(entries).toHaveLength(1);
    expect(entries[0]?.title).toBe('解释高斯分布');
    expect(entries[0]?.normalizedContent).toContain('高斯分布是一种连续概率分布');
  });

  it('does not capture shell prompts or Claude banner text', () => {
    const capture = new AiOutputCapture();

    capture.push('Microsoft Windows [版本 10]\nC:\\Users\\Taylor>claude\nClaude Code v2\n');
    const entry = capture.flush();

    expect(entry).toBeNull();
  });

  it('ignores terminal noise after a prompt-like start', () => {
    const capture = new AiOutputCapture();

    capture.push('解释高斯分布\n');
    capture.push('这是一个测试。\n');
    capture.push('C:\\Users\\Taylor>dir\n');

    expect(capture.flush()).toBeNull();
  });

  it('ends capture when a decorated prompt arrives', () => {
    const capture = new AiOutputCapture();

    capture.setPrompt('[36m>[0m 解释高斯分布');
    capture.push('高斯分布是一种连续概率分布。\n');

    const entry = capture.push('[36m❯[0m\n')[0];

    expect(entry).toBeDefined();
    expect(entry?.title).toBe('解释高斯分布');
    expect(entry?.content).toContain('高斯分布是一种连续概率分布。');
  });

  it('ignores Claude resume picker UI instead of capturing it as an answer', () => {
    const capture = new AiOutputCapture();

    capture.push('────────────────────────────Resume session\n');
    capture.push('(1 of 50) ╭─────────────  Search...\n');
    capture.push('Gaussian function mathematics 10 minutes ago · HEAD · 23.2KB 解释一下泰勒展开\n');
    capture.push('Gaussianfunctionmathematics10minutesago·HEAD·23.2KB解释一下泰勒展开\n');
    capture.push('1 hour ago · HEAD · 20.9KB Gaussian splatting 数学模型介绍\n');
    capture.push('1hourago·HEAD·37.4KBWoodburymatrixinversionformula1hourago·HEAD·39.3KB你好\n');
    capture.push('4 days ago · HEAD · 624.5KB /clear\n');
    capture.push('Space to preview · Ctrl+R to rename · Type to search · Esc to cancel\n');
    capture.push('Ctrl+B to only show current batch · Spacpreview · Ctrl+R to rename · Type to search · Esc to cancel\n');

    expect(capture.flush()).toBeNull();
  });

  it('drops built-in command UI that appears after accidental capture starts', () => {
    const capture = new AiOutputCapture();

    capture.push('模型\n');
    capture.push('model  Select model\n');
    capture.push('new    Start a new session\n');
    capture.push('status Show status\n');

    expect(capture.flush()).toBeNull();
  });

  it('separates first prompt noise from the AI answer marker', () => {
    const capture = new AiOutputCapture();

    capture.setPrompt('▘▘▝▝C:\\Users\\Taylor❯ 什么是高光谱图像，数学形式是什么，数学环境使用$');
    capture.push('▘▘▝▝C:\\Users\\Taylor❯ 什么是高光谱图像，数学形式是什么，数学环境使用$●高光谱图像（HyperspectralImage,HSI）是一种同时记录空间信息和光谱信息的图像数据。\n');
    const entry = capture.flush();

    expect(entry).not.toBeNull();
    expect(entry?.title).toBe('什么是高光谱图像，数学形式是什么，数学环境使用$');
    expect(entry?.content).toContain('高光谱图像（HyperspectralImage,HSI）');
    expect(entry?.content).not.toContain('C:\\Users\\Taylor');
    expect(entry?.content).not.toContain('什么是高光谱图像，数学形式是什么');
    expect(entry?.content).not.toContain('▘');
    expect(entry?.content).not.toContain('▝');
  });

  it('drops a standalone echoed path prompt line (❯) without losing the answer', () => {
    const capture = new AiOutputCapture();

    capture.push('C:\\Users\\Taylor❯ 解释高斯分布\n');
    capture.push('高斯分布是一种连续概率分布。\n');
    const entry = capture.push('❯\n')[0];

    expect(entry).toBeDefined();
    expect(entry?.content).toContain('高斯分布是一种连续概率分布');
    expect(entry?.content).not.toContain('C:\\Users\\Taylor');
    expect(entry?.content).not.toContain('❯');
  });

  it('strips a trailing path prompt line appended after the answer', () => {
    const capture = new AiOutputCapture();

    capture.push('● 高光谱图像是一种图像数据。\n');
    capture.push('▘▝C:\\Users\\Taylor❯ \n');
    const entry = capture.push('❯\n')[0];

    expect(entry).toBeDefined();
    expect(entry?.content).toContain('高光谱图像是一种图像数据');
    expect(entry?.content).not.toContain('C:\\Users\\Taylor');
    expect(entry?.content).not.toContain('▘');
    expect(entry?.content).not.toContain('▝');
  });

  it('still discards a cmd.exe command line (>) and voids the capture', () => {
    const capture = new AiOutputCapture();

    capture.push('解释高斯分布\n');
    capture.push('这是一个测试。\n');
    capture.push('C:\\Users\\Taylor>dir\n');

    expect(capture.flush()).toBeNull();
  });

  it('bounds runaway capture instead of storing an unbounded dump', () => {
    const capture = new AiOutputCapture();

    capture.push('解释高斯分布\n');
    for (let index = 0; index < 600; index += 1) {
      capture.push(`第${index}行：这是一些持续输出。\n`);
    }

    const entry = capture.flush();

    expect(entry).not.toBeNull();
    expect(entry?.content.length).toBeLessThanOrEqual(24_000);
  });

  it('keeps streamed table rows contiguous across chunk boundaries', () => {
    const capture = new AiOutputCapture();

    capture.push('● 对比如下：\n');
    capture.push('| 名称 | 值 |\n');
    capture.push('| --- | --- |\n');
    capture.push('| a | 1 |\n');
    capture.push('| b | 2 |\n');
    const entry = capture.flush();

    expect(entry).not.toBeNull();
    expect(entry?.content).toContain('| 名称 | 值 |\n| --- | --- |\n| a | 1 |');
    expect(entry?.content).not.toContain('|\n\n|');
  });

  it('preserves a real blank line inside a single chunk', () => {
    const capture = new AiOutputCapture();

    capture.push('● 第一段。\n\n第二段。\n');
    const entry = capture.flush();

    expect(entry?.content).toContain('第一段。\n\n第二段。');
  });
});
