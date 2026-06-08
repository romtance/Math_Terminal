export const IPC_CHANNELS = {
  terminalStart: 'terminal:start',
  terminalInput: 'terminal:input',
  terminalResize: 'terminal:resize',
  terminalKill: 'terminal:kill',
  terminalData: 'terminal:data',
  terminalExit: 'terminal:exit',
  terminalError: 'terminal:error',
  windowControl: 'window:control',
  imageResolve: 'image:resolve'
} as const;

export type WindowAction = 'minimize' | 'maximize' | 'close';

export type TerminalExitPayload = {
  exitCode?: number;
  signal?: number;
};

export type TerminalErrorPayload = {
  message: string;
};

export type TerminalResizePayload = {
  cols: number;
  rows: number;
};

export type Unsubscribe = () => void;

export type TerminalApi = {
  start: (cols: number, rows: number) => Promise<void>;
  input: (data: string) => void;
  resize: (cols: number, rows: number) => void;
  kill: () => void;
  onData: (callback: (data: string) => void) => Unsubscribe;
  onExit: (callback: (payload: TerminalExitPayload) => void) => Unsubscribe;
  onError: (callback: (payload: TerminalErrorPayload) => void) => Unsubscribe;
};

export type ImageApi = {
  resolve: (source: string) => Promise<string | null>;
};

declare global {
  interface Window {
    terminalApi: TerminalApi;
    imageApi: ImageApi;
    windowApi: { control: (action: WindowAction) => void };
  }
}
