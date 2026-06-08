import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS, type ImageApi, type TerminalApi, type TerminalErrorPayload, type TerminalExitPayload, type WindowAction } from '../shared/ipcTypes';

const terminalApi: TerminalApi = {
  start: async (cols, rows) => {
    await ipcRenderer.invoke(IPC_CHANNELS.terminalStart, { cols, rows });
  },
  input: (data) => {
    ipcRenderer.send(IPC_CHANNELS.terminalInput, data);
  },
  resize: (cols, rows) => {
    ipcRenderer.send(IPC_CHANNELS.terminalResize, { cols, rows });
  },
  kill: () => {
    ipcRenderer.send(IPC_CHANNELS.terminalKill);
  },
  onData: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, data: string): void => callback(data);
    ipcRenderer.on(IPC_CHANNELS.terminalData, listener);
    return () => ipcRenderer.off(IPC_CHANNELS.terminalData, listener);
  },
  onExit: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: TerminalExitPayload): void => callback(payload);
    ipcRenderer.on(IPC_CHANNELS.terminalExit, listener);
    return () => ipcRenderer.off(IPC_CHANNELS.terminalExit, listener);
  },
  onError: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: TerminalErrorPayload): void => callback(payload);
    ipcRenderer.on(IPC_CHANNELS.terminalError, listener);
    return () => ipcRenderer.off(IPC_CHANNELS.terminalError, listener);
  }
};

const imageApi: ImageApi = {
  resolve: async (source) => {
    return ipcRenderer.invoke(IPC_CHANNELS.imageResolve, source) as Promise<string | null>;
  }
};

contextBridge.exposeInMainWorld('terminalApi', terminalApi);
contextBridge.exposeInMainWorld('imageApi', imageApi);
contextBridge.exposeInMainWorld('windowApi', {
  control: (action: WindowAction) => ipcRenderer.send(IPC_CHANNELS.windowControl, action)
});
