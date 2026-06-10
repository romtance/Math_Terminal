# Math Terminal

Math Terminal 是一个面向 AI 输出阅读体验的桌面终端工具。

它在左侧提供本地终端，在右侧自动捕获 AI 回答，并将 Markdown、LaTeX 数学公式、代码块和图片渲染成更清晰的预览文档。

> ps: 特别感谢 **Unity2.ai** 以及活动主办方提供的支持与资源。
## 软件预览

![Math Terminal 软件页面截图 1](./imgs/demo.png)

![Math Terminal 软件页面截图 2](./imgs/demo1.png)

演示视频：[demo.mp4](./imgs/demo.mp4)

## 主要功能

- 内嵌本地终端，支持正常命令行交互。
- 自动捕获 AI 回答，过滤终端提示符和状态信息。
- 将 AI 输出渲染为 Markdown 预览文档。
- 支持 LaTeX 数学公式、矩阵和多行公式渲染。
- 当前公式渲染建议统一使用单美元符号 `$`，不要使用 `$$`。
- 支持本地图片引用预览。
- 支持回答历史、删除当前回答和清空全部回答。
- 支持拖拽调整终端和预览区域宽度。
- 支持预览内容缩放。

## 使用场景

- 使用 Claude Code 等命令行 AI 工具时，整理和阅读长回答。
- 查看 AI 生成的数学公式、推导过程和 Markdown 文档。
- 在终端中进行 AI 编程、学习、写作和文档生成。

## 快速开始

```bash
npm install
npm run dev
```

启动后，左侧是终端，右侧是 AI Preview 预览面板。

你可以在左侧终端中运行 AI 工具并输入问题，例如：

```text
请解释欧拉公式，并使用 LaTeX 展示关键公式，统一使用单美元符号 `$`。
```

AI 回答完成后，右侧会自动生成格式化预览。

## 公式书写说明

目前项目的公式渲染规则建议统一使用单美元符号 `$`。

行内公式示例：

```markdown
欧拉公式是 $e^{ix}=\cos x+i\sin x$。
```

行间公式也建议使用单美元符号单独包裹：

```markdown
$
e^{ix}=\cos x+i\sin x
$
```

请尽量不要使用 `$$ ... $$` 作为公式块。当前版本中，`$$` 在部分 AI 输出场景下可能触发渲染或格式解析问题。

## 文档

- [部署文档](./DEPLOY.md)

## 技术栈

- Electron
- Electron Vite
- TypeScript
- xterm.js
- node-pty
- markdown-it
- KaTeX
- DOMPurify
- Vitest
