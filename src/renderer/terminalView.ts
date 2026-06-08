import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import type { PreviewPane } from './previewPane';

export class TerminalView {
  private readonly terminal: Terminal;
  private readonly fitAddon: FitAddon;
  private readonly preview: PreviewPane;
  private readonly unsubscribers: Array<() => void> = [];
  private resizeObserver: ResizeObserver | null = null;
  private lastResizeCols = 0;
  private lastResizeRows = 0;
  private resizeTimeout: number | null = null;
  private promptBuffer = '';

  constructor(container: HTMLElement, preview: PreviewPane) {
    this.preview = preview;
    this.terminal = new Terminal({
      cursorBlink: true,
      convertEol: true,
      fontFamily: 'SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
      fontSize: 14,
      theme: {
        background: '#000000',
        foreground: '#f5f5f7',
        cursor: '#ffffff',
        selectionBackground: '#1d1d1f',
        black: '#000000',
        brightBlack: '#3a3a3c'
      }
    });
    this.fitAddon = new FitAddon();

    this.terminal.loadAddon(this.fitAddon);
    this.terminal.open(container);
    this.terminal.writeln('Starting embedded shell...');
    this.terminal.focus();
    this.fit();

    container.addEventListener('pointerdown', () => this.terminal.focus());
    container.addEventListener('dblclick', () => {
      this.preview.jumpToSelectedEntry();
    });

    this.terminal.onData((data) => {
      if (data === '\r') {
        if (this.promptBuffer.trim()) {
          this.preview.setPrompt(this.promptBuffer);
        }
        this.promptBuffer = '';
      } else if (data === '\b' || data === '\x7f') {
        this.promptBuffer = this.promptBuffer.slice(0, -1);
      } else if (data === '') {
        this.promptBuffer = '';
      } else if (data >= ' ' && data !== '\x7f') {
        this.promptBuffer += data;
      }

      window.terminalApi.input(data);
    });

    this.unsubscribers.push(
      window.terminalApi.onData((data) => {
        this.terminal.write(data);
        this.preview.appendOutput(data);
      })
    );

    this.unsubscribers.push(
      window.terminalApi.onExit(({ exitCode }) => {
        this.terminal.writeln('');
        this.terminal.writeln(`[process exited${typeof exitCode === 'number' ? ` with code ${exitCode}` : ''}]`);
      })
    );

    this.unsubscribers.push(
      window.terminalApi.onError(({ message }) => {
        this.terminal.writeln('');
        this.terminal.writeln(`[terminal error] ${message}`);
      })
    );

    this.resizeObserver = new ResizeObserver(() => {
      this.fit();
      this.scheduleResize();
    });
    this.resizeObserver.observe(container);

    window.setTimeout(() => {
      void this.startTerminal();
    }, 0);
  }

  private async startTerminal(): Promise<void> {
    this.fit();
    this.terminal.focus();

    const cols = this.terminal.cols || 80;
    const rows = this.terminal.rows || 24;

    await window.terminalApi.start(cols, rows);
    this.fit();
    this.sendResize();
  }

  private scheduleResize(): void {
    if (this.resizeTimeout !== null) {
      window.clearTimeout(this.resizeTimeout);
    } else {
      this.preview.setCaptureSuspended(true);
    }

    this.resizeTimeout = window.setTimeout(() => {
      this.resizeTimeout = null;
      this.sendResize();
      this.preview.setCaptureSuspended(false);
    }, 120);
  }

  private sendResize(): void {
    const cols = this.terminal.cols;
    const rows = this.terminal.rows;

    if (cols <= 0 || rows <= 0) {
      return;
    }

    if (cols === this.lastResizeCols && rows === this.lastResizeRows) {
      return;
    }

    this.lastResizeCols = cols;
    this.lastResizeRows = rows;
    window.terminalApi.resize(cols, rows);
  }

  dispose(): void {
    this.resizeObserver?.disconnect();
    if (this.resizeTimeout !== null) {
      window.clearTimeout(this.resizeTimeout);
      this.resizeTimeout = null;
    }
    this.unsubscribers.forEach((unsubscribe) => unsubscribe());
    window.terminalApi.kill();
    this.terminal.dispose();
  }

  private fit(): void {
    try {
      this.fitAddon.fit();
    } catch {
      // The terminal may not be measurable during initial layout. A later resize will fit it.
    }
  }
}
