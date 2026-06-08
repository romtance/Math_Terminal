import { ipcMain, BrowserWindow } from 'electron';
import { existsSync, statSync } from 'node:fs';
import { extname, isAbsolute, join, normalize } from 'node:path';
import { pathToFileURL } from 'node:url';
import { IPC_CHANNELS, type TerminalResizePayload, type WindowAction } from '../shared/ipcTypes';
import type { PtyManager } from './ptyManager';

function isValidSize(payload: unknown): payload is TerminalResizePayload {
  if (typeof payload !== 'object' || payload === null) {
    return false;
  }

  const { cols, rows } = payload as TerminalResizePayload;
  return (
    typeof cols === 'number' && Number.isFinite(cols) && cols >= 1 &&
    typeof rows === 'number' && Number.isFinite(rows) && rows >= 1
  );
}

const IMAGE_EXTENSIONS = new Set(['.apng', '.avif', '.gif', '.jpg', '.jpeg', '.png', '.svg', '.webp']);

function resolveImageSource(source: unknown): string | null {
  if (typeof source !== 'string') {
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

export function registerTerminalIpc(ptyManager: PtyManager): void {
  ipcMain.handle(IPC_CHANNELS.imageResolve, (_event, source: unknown) => resolveImageSource(source));

  ipcMain.handle(IPC_CHANNELS.terminalStart, (_event, payload: unknown) => {
    if (!isValidSize(payload)) {
      return;
    }

    ptyManager.start(payload.cols, payload.rows);
  });

  ipcMain.on(IPC_CHANNELS.terminalInput, (_event, data: string) => {
    ptyManager.write(data);
  });

  ipcMain.on(IPC_CHANNELS.terminalResize, (_event, payload: unknown) => {
    if (!isValidSize(payload)) {
      return;
    }

    ptyManager.resize(payload.cols, payload.rows);
  });

  ipcMain.on(IPC_CHANNELS.terminalKill, () => {
    ptyManager.kill();
  });

  ipcMain.on(IPC_CHANNELS.windowControl, (event, action: WindowAction) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return;
    if (action === 'minimize') win.minimize();
    else if (action === 'maximize') win.isMaximized() ? win.unmaximize() : win.maximize();
    else if (action === 'close') win.close();
  });
}
