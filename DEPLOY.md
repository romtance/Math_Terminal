# 部署文档

本文档说明如何在本地运行、构建和打包 Math Terminal。

## 环境要求

建议环境：

- Node.js 18 或更高版本
- npm
- Windows / macOS / Linux

本项目使用 Electron 和 node-pty。首次安装依赖时，如果 node-pty 需要本地编译，请确保系统具备对应平台的编译环境。

## 安装依赖

在项目根目录执行：

```bash
npm install
```

## 本地开发运行

```bash
npm run dev
```

启动后会打开 Math Terminal 桌面窗口。

## 类型检查

```bash
npm run typecheck
```

## 运行测试

```bash
npm run test
```

## 构建项目

```bash
npm run build
```

该命令会先执行类型检查，然后使用 electron-vite 构建主进程、预加载脚本和渲染进程代码。

## 打包桌面应用

```bash
npm run dist
```

打包产物会输出到：

```text
release/
```

当前配置中：

- Windows 目标格式为 portable。
- Linux 目标格式为 AppImage。
- 应用图标使用根目录下的 `icon.png`。

## 常用命令汇总

```bash
# 安装依赖
npm install

# 开发运行
npm run dev

# 类型检查
npm run typecheck

# 运行测试
npm run test

# 构建
npm run build

# 打包
npm run dist
```

## 项目结构

```text
src/
  main/        Electron 主进程、终端进程管理和 IPC 注册
  preload/     暴露给渲染进程的安全 API
  renderer/    前端界面、终端视图、AI 预览和 Markdown 渲染
  shared/      共享类型定义

tests/
  unit/        单元测试

imgs/          README 中使用的截图和演示视频
release/       打包输出目录
```

## 注意事项

1. 如果修改了图标，请保持 `icon.png` 位于项目根目录，或同步修改 `package.json` 中的打包配置。
2. 如果 README 中的演示图片或视频无法显示，请确认 `imgs/demo.png`、`imgs/demo1.png`、`imgs/demo.mp4` 是否存在。
3. 如果终端无法启动，请检查 node-pty 是否安装成功，以及当前系统是否允许 Electron 启动本地 shell。
