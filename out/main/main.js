import { ipcMain, BrowserWindow, app, nativeImage } from "electron";
import { normalize, isAbsolute, join, extname } from "node:path";
import { pathToFileURL } from "node:url";
import { existsSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { platform } from "node:process";
import { spawn } from "node-pty";
import __cjs_mod__ from "node:module";
const __filename = import.meta.filename;
const __dirname = import.meta.dirname;
const require2 = __cjs_mod__.createRequire(import.meta.url);
const IPC_CHANNELS = {
  terminalStart: "terminal:start",
  terminalInput: "terminal:input",
  terminalResize: "terminal:resize",
  terminalKill: "terminal:kill",
  terminalData: "terminal:data",
  terminalExit: "terminal:exit",
  terminalError: "terminal:error",
  windowControl: "window:control",
  imageResolve: "image:resolve"
};
function isValidSize(payload) {
  if (typeof payload !== "object" || payload === null) {
    return false;
  }
  const { cols, rows } = payload;
  return typeof cols === "number" && Number.isFinite(cols) && cols >= 1 && typeof rows === "number" && Number.isFinite(rows) && rows >= 1;
}
const IMAGE_EXTENSIONS = /* @__PURE__ */ new Set([".apng", ".avif", ".gif", ".jpg", ".jpeg", ".png", ".svg", ".webp"]);
function resolveImageSource(source) {
  if (typeof source !== "string") {
    return null;
  }
  const trimmed = source.trim();
  if (!trimmed || /^(?:https?:|data:|file:)/i.test(trimmed)) {
    return null;
  }
  const path = normalize(isAbsolute(trimmed) ? trimmed : join(process.cwd(), trimmed));
  if (!IMAGE_EXTENSIONS.has(extname(path).toLowerCase()) || !existsSync(path)) {
    return null;
  }
  try {
    return statSync(path).isFile() ? pathToFileURL(path).toString() : null;
  } catch {
    return null;
  }
}
function registerTerminalIpc(ptyManager2) {
  ipcMain.handle(IPC_CHANNELS.imageResolve, (_event, source) => resolveImageSource(source));
  ipcMain.handle(IPC_CHANNELS.terminalStart, (_event, payload) => {
    if (!isValidSize(payload)) {
      return;
    }
    ptyManager2.start(payload.cols, payload.rows);
  });
  ipcMain.on(IPC_CHANNELS.terminalInput, (_event, data) => {
    ptyManager2.write(data);
  });
  ipcMain.on(IPC_CHANNELS.terminalResize, (_event, payload) => {
    if (!isValidSize(payload)) {
      return;
    }
    ptyManager2.resize(payload.cols, payload.rows);
  });
  ipcMain.on(IPC_CHANNELS.terminalKill, () => {
    ptyManager2.kill();
  });
  ipcMain.on(IPC_CHANNELS.windowControl, (event, action) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return;
    if (action === "minimize") win.minimize();
    else if (action === "maximize") win.isMaximized() ? win.unmaximize() : win.maximize();
    else if (action === "close") win.close();
  });
}
class PtyManager {
  ptyProcess = null;
  window = null;
  attachWindow(window) {
    this.window = window;
  }
  detachWindow() {
    this.window = null;
  }
  start(cols, rows) {
    if (this.ptyProcess) {
      return;
    }
    const shell = resolveDefaultShell();
    const options = {
      name: "xterm-256color",
      cols,
      rows,
      cwd: homedir() || process.cwd(),
      env: {
        ...process.env,
        TERM: "xterm-256color"
      }
    };
    try {
      this.ptyProcess = spawn(shell.command, shell.args, options);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.sendToRenderer(IPC_CHANNELS.terminalError, {
        message: `Failed to start shell "${shell.command}": ${message}`
      });
      return;
    }
    this.ptyProcess.onData((data) => {
      this.sendToRenderer(IPC_CHANNELS.terminalData, data);
    });
    this.ptyProcess.onExit(({ exitCode, signal }) => {
      const payload = { exitCode, signal };
      this.sendToRenderer(IPC_CHANNELS.terminalExit, payload);
      this.ptyProcess = null;
    });
  }
  write(data) {
    this.ptyProcess?.write(data);
  }
  resize(cols, rows) {
    if (!this.ptyProcess || !Number.isFinite(cols) || !Number.isFinite(rows) || cols < 1 || rows < 1) {
      return;
    }
    this.ptyProcess.resize(Math.floor(cols), Math.floor(rows));
  }
  kill() {
    if (!this.ptyProcess) {
      return;
    }
    const processToKill = this.ptyProcess;
    this.ptyProcess = null;
    processToKill.kill();
  }
  sendToRenderer(channel, payload) {
    try {
      if (!this.window || this.window.isDestroyed()) {
        return;
      }
      const { webContents } = this.window;
      if (webContents.isDestroyed()) {
        return;
      }
      webContents.send(channel, payload);
    } catch {
    }
  }
}
function resolveDefaultShell() {
  if (platform === "win32") {
    return {
      command: process.env.COMSPEC || "cmd.exe",
      args: []
    };
  }
  const shell = process.env.SHELL;
  if (shell) {
    return { command: shell, args: [] };
  }
  if (existsSync("/bin/bash")) {
    return { command: "/bin/bash", args: [] };
  }
  return { command: "/bin/sh", args: [] };
}
let mainWindow = null;
const ptyManager = new PtyManager();
function createWindow() {
  const icon = nativeImage.createFromPath(join(app.getAppPath(), "icon.png"));
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: "Math Terminal",
    icon,
    frame: false,
    backgroundColor: "#0a0a0a",
    webPreferences: {
      preload: join(__dirname, "../preload/preload.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });
  ptyManager.attachWindow(mainWindow);
  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void mainWindow.loadURL(pathToFileURL(join(__dirname, "../renderer/index.html")).toString());
  }
  mainWindow.on("closed", () => {
    ptyManager.detachWindow();
    ptyManager.kill();
    mainWindow = null;
  });
}
app.whenReady().then(() => {
  registerTerminalIpc(ptyManager);
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
app.on("before-quit", () => {
  ptyManager.kill();
});
