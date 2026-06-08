import type { BrowserWindow } from 'electron';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { platform } from 'node:process';
import type { IPty, IWindowsPtyForkOptions, IPtyForkOptions } from 'node-pty';
import { spawn } from 'node-pty';
import { IPC_CHANNELS, type TerminalExitPayload } from '../shared/ipcTypes';

export class PtyManager {
  private ptyProcess: IPty | null = null;
  private window: BrowserWindow | null = null;

  attachWindow(window: BrowserWindow): void {
    this.window = window;
  }

  detachWindow(): void {
    this.window = null;
  }

  start(cols: number, rows: number): void {
    if (this.ptyProcess) {
      return;
    }

    const shell = resolveDefaultShell();
    const options: IPtyForkOptions | IWindowsPtyForkOptions = {
      name: 'xterm-256color',
      cols,
      rows,
      cwd: homedir() || process.cwd(),
      env: {
        ...process.env,
        TERM: 'xterm-256color'
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
      const payload: TerminalExitPayload = { exitCode, signal };
      this.sendToRenderer(IPC_CHANNELS.terminalExit, payload);
      this.ptyProcess = null;
    });
  }

  write(data: string): void {
    this.ptyProcess?.write(data);
  }

  resize(cols: number, rows: number): void {
    if (
      !this.ptyProcess ||
      !Number.isFinite(cols) || !Number.isFinite(rows) ||
      cols < 1 || rows < 1
    ) {
      return;
    }

    this.ptyProcess.resize(Math.floor(cols), Math.floor(rows));
  }

  kill(): void {
    if (!this.ptyProcess) {
      return;
    }

    const processToKill = this.ptyProcess;
    this.ptyProcess = null;
    processToKill.kill();
  }

  private sendToRenderer(channel: string, payload: unknown): void {
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
      // Window or webContents may be torn down between the checks and the send call.
    }
  }
}

type ShellConfig = {
  command: string;
  args: string[];
};

function resolveDefaultShell(): ShellConfig {
  if (platform === 'win32') {
    return {
      command: process.env.COMSPEC || 'cmd.exe',
      args: []
    };
  }

  const shell = process.env.SHELL;
  if (shell) {
    return { command: shell, args: [] };
  }

  if (existsSync('/bin/bash')) {
    return { command: '/bin/bash', args: [] };
  }

  return { command: '/bin/sh', args: [] };
}
