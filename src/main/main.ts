import { app, BrowserWindow, nativeImage } from 'electron';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { registerTerminalIpc } from './ipc';
import { PtyManager } from './ptyManager';

let mainWindow: BrowserWindow | null = null;
const ptyManager = new PtyManager();

function createWindow(): void {
  const icon = nativeImage.createFromPath(join(app.getAppPath(), 'icon.png'));
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'Math Terminal',
    icon,
    frame: false,
    backgroundColor: '#0a0a0a',
    webPreferences: {
      preload: join(__dirname, '../preload/preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  ptyManager.attachWindow(mainWindow);

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void mainWindow.loadURL(pathToFileURL(join(__dirname, '../renderer/index.html')).toString());
  }

  mainWindow.on('closed', () => {
    ptyManager.detachWindow();
    ptyManager.kill();
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  registerTerminalIpc(ptyManager);
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  ptyManager.kill();
});
