import '@xterm/xterm/css/xterm.css';
import 'katex/dist/katex.min.css';
import './styles.css';
import { PreviewPane } from './previewPane';
import { TerminalView } from './terminalView';

const app = document.querySelector<HTMLDivElement>('#app');

if (!app) {
  throw new Error('App root not found.');
}

app.innerHTML = `
  <header class="titlebar">
    <span class="titlebar-title">Math Terminal</span>
    <div class="titlebar-controls">
      <button class="titlebar-btn" id="btn-minimize" title="Minimize" aria-label="Minimize">&#x2013;</button>
      <button class="titlebar-btn" id="btn-maximize" title="Maximize" aria-label="Maximize">&#x25A1;</button>
      <button class="titlebar-btn titlebar-btn-close" id="btn-close" title="Close" aria-label="Close">&#x2715;</button>
    </div>
  </header>
  <main class="app-shell">
    <section class="terminal-pane">
      <div class="terminal-root" id="terminal-root"></div>
    </section>
    <div
      id="pane-resizer"
      class="pane-resizer"
      role="separator"
      aria-label="Resize terminal and preview panes"
      aria-orientation="vertical"
      tabindex="0"
    ></div>
    <aside id="preview-root" class="preview-pane"></aside>
  </main>
`;

document.getElementById('btn-minimize')!.addEventListener('click', () => window.windowApi.control('minimize'));
document.getElementById('btn-maximize')!.addEventListener('click', () => window.windowApi.control('maximize'));
document.getElementById('btn-close')!.addEventListener('click', () => window.windowApi.control('close'));

const appShell = document.querySelector<HTMLElement>('.app-shell');
const terminalRoot = document.querySelector<HTMLElement>('#terminal-root');
const paneResizer = document.querySelector<HTMLElement>('#pane-resizer');
const previewRoot = document.querySelector<HTMLElement>('#preview-root');

if (!appShell || !terminalRoot || !paneResizer || !previewRoot) {
  throw new Error('App panes failed to initialize.');
}

const MIN_TERMINAL_WIDTH = 520;
const MIN_PREVIEW_WIDTH = 320;
const RESIZE_KEY_STEP = 24;
const STORAGE_KEY = 'math-terminal:pane-split-width';
const RESIZE_CAPTURE_RESUME_DELAY = 180;

let currentTerminalWidth = 0;
let activePointerId: number | null = null;
let resizeCaptureResumeTimeout: number | null = null;

const setCaptureSuspended = (suspended: boolean) => {
  window.requestAnimationFrame(() => {
    previewPane.setCaptureSuspended(suspended);
  });
};

const clampTerminalWidth = (width: number) => {
  const shellWidth = appShell.getBoundingClientRect().width;
  const resizerWidth = paneResizer.getBoundingClientRect().width;
  const maxTerminalWidth = Math.max(MIN_TERMINAL_WIDTH, shellWidth - MIN_PREVIEW_WIDTH - resizerWidth);

  return Math.min(Math.max(width, MIN_TERMINAL_WIDTH), maxTerminalWidth);
};

const updateResizerValue = () => {
  const shellWidth = appShell.getBoundingClientRect().width;
  const resizerWidth = paneResizer.getBoundingClientRect().width;
  const maxTerminalWidth = Math.max(MIN_TERMINAL_WIDTH, shellWidth - MIN_PREVIEW_WIDTH - resizerWidth);

  paneResizer.setAttribute('aria-valuemin', String(MIN_TERMINAL_WIDTH));
  paneResizer.setAttribute('aria-valuemax', String(Math.round(maxTerminalWidth)));
  paneResizer.setAttribute('aria-valuenow', String(Math.round(currentTerminalWidth)));
};

const setTerminalPaneWidth = (width: number) => {
  currentTerminalWidth = clampTerminalWidth(width);
  appShell.style.setProperty('--terminal-pane-width', `${currentTerminalWidth}px`);
  updateResizerValue();
};

const saveTerminalPaneWidth = () => {
  localStorage.setItem(STORAGE_KEY, String(Math.round(currentTerminalWidth)));
};

const storedTerminalWidth = Number(localStorage.getItem(STORAGE_KEY));
const initialTerminalWidth = Number.isFinite(storedTerminalWidth)
  ? storedTerminalWidth
  : appShell.getBoundingClientRect().width * 0.62;

setTerminalPaneWidth(initialTerminalWidth);

paneResizer.addEventListener('pointerdown', (event) => {
  activePointerId = event.pointerId;
  paneResizer.setPointerCapture(event.pointerId);
  appShell.classList.add('is-resizing');
  if (resizeCaptureResumeTimeout !== null) {
    window.clearTimeout(resizeCaptureResumeTimeout);
    resizeCaptureResumeTimeout = null;
  }
  setCaptureSuspended(true);
});

paneResizer.addEventListener('pointermove', (event) => {
  if (activePointerId !== event.pointerId) {
    return;
  }

  const shellLeft = appShell.getBoundingClientRect().left;
  setTerminalPaneWidth(event.clientX - shellLeft);
});

const stopResize = (event: PointerEvent) => {
  if (activePointerId !== event.pointerId) {
    return;
  }

  if (paneResizer.hasPointerCapture(event.pointerId)) {
    paneResizer.releasePointerCapture(event.pointerId);
  }

  activePointerId = null;
  appShell.classList.remove('is-resizing');
  saveTerminalPaneWidth();

  if (resizeCaptureResumeTimeout !== null) {
    window.clearTimeout(resizeCaptureResumeTimeout);
  }

  resizeCaptureResumeTimeout = window.setTimeout(() => {
    resizeCaptureResumeTimeout = null;
    setCaptureSuspended(false);
  }, RESIZE_CAPTURE_RESUME_DELAY);
};

paneResizer.addEventListener('pointerup', stopResize);
paneResizer.addEventListener('pointercancel', stopResize);

paneResizer.addEventListener('keydown', (event) => {
  if (event.key === 'ArrowLeft') {
    event.preventDefault();
    setTerminalPaneWidth(currentTerminalWidth - RESIZE_KEY_STEP);
    saveTerminalPaneWidth();
  }

  if (event.key === 'ArrowRight') {
    event.preventDefault();
    setTerminalPaneWidth(currentTerminalWidth + RESIZE_KEY_STEP);
    saveTerminalPaneWidth();
  }

  if (event.key === 'Home') {
    event.preventDefault();
    setTerminalPaneWidth(MIN_TERMINAL_WIDTH);
    saveTerminalPaneWidth();
  }

  if (event.key === 'End') {
    event.preventDefault();
    setTerminalPaneWidth(Number.POSITIVE_INFINITY);
    saveTerminalPaneWidth();
  }
});

window.addEventListener('resize', () => {
  setTerminalPaneWidth(currentTerminalWidth);
});

const previewPane = new PreviewPane(previewRoot);
const terminalView = new TerminalView(terminalRoot, previewPane);

window.addEventListener('beforeunload', () => {
  if (resizeCaptureResumeTimeout !== null) {
    window.clearTimeout(resizeCaptureResumeTimeout);
  }
  terminalView.dispose();
});
