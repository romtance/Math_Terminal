import { contextBridge, ipcRenderer } from "electron";
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
const terminalApi = {
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
    const listener = (_event, data) => callback(data);
    ipcRenderer.on(IPC_CHANNELS.terminalData, listener);
    return () => ipcRenderer.off(IPC_CHANNELS.terminalData, listener);
  },
  onExit: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on(IPC_CHANNELS.terminalExit, listener);
    return () => ipcRenderer.off(IPC_CHANNELS.terminalExit, listener);
  },
  onError: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on(IPC_CHANNELS.terminalError, listener);
    return () => ipcRenderer.off(IPC_CHANNELS.terminalError, listener);
  }
};
const imageApi = {
  resolve: async (source) => {
    return ipcRenderer.invoke(IPC_CHANNELS.imageResolve, source);
  }
};
contextBridge.exposeInMainWorld("terminalApi", terminalApi);
contextBridge.exposeInMainWorld("imageApi", imageApi);
contextBridge.exposeInMainWorld("windowApi", {
  control: (action) => ipcRenderer.send(IPC_CHANNELS.windowControl, action)
});
