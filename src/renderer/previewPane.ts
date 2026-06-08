import { AiOutputCapture, type AiAnswerEntry } from './aiOutputCapture';
import { renderMarkdownAsync } from './markdownRenderer';

type ClearMode = 'current' | 'all';

const MIN_PREVIEW_ZOOM = 0.75;
const MAX_PREVIEW_ZOOM = 1.6;
const PREVIEW_ZOOM_STEP = 0.08;

export class PreviewPane {
  private readonly container: HTMLElement;
  private readonly status: HTMLElement;
  private readonly historyList: HTMLElement;
  private readonly content: HTMLElement;
  private readonly clearCurrentButton: HTMLButtonElement;
  private readonly clearAllButton: HTMLButtonElement;
  private readonly capture = new AiOutputCapture();
  private zoom = 1;
  private enabled = true;
  private captureSuspended = false;
  private entries: AiAnswerEntry[] = [];
  private selectedId: string | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
    this.container.innerHTML = `
      <div class="preview-toolbar">
        <div>
          <strong>AI Preview</strong>
          <span id="preview-status" class="preview-status">Waiting for completed AI answers</span>
        </div>
        <div class="preview-actions">
          <button id="preview-toggle" type="button">Preview On</button>
          <button id="preview-clear-current" type="button" title="Delete the selected history item">Delete Current</button>
          <button id="preview-clear-all" type="button" title="Delete all history items">Clear All</button>
        </div>
      </div>
      <div class="preview-body">
        <nav class="preview-history" aria-label="AI answer history">
          <div class="preview-history-title">Prompts</div>
          <div id="preview-history-list" class="preview-history-list"></div>
        </nav>
        <article id="preview-content" class="preview-content" tabindex="-1"></article>
      </div>
    `;

    const status = this.container.querySelector<HTMLElement>('#preview-status');
    const historyList = this.container.querySelector<HTMLElement>('#preview-history-list');
    const content = this.container.querySelector<HTMLElement>('#preview-content');
    const toggle = this.container.querySelector<HTMLButtonElement>('#preview-toggle');
    const clearCurrent = this.container.querySelector<HTMLButtonElement>('#preview-clear-current');
    const clearAll = this.container.querySelector<HTMLButtonElement>('#preview-clear-all');

    if (!status || !historyList || !content || !toggle || !clearCurrent || !clearAll) {
      throw new Error('Preview pane template failed to initialize.');
    }

    this.status = status;
    this.historyList = historyList;
    this.content = content;
    this.clearCurrentButton = clearCurrent;
    this.clearAllButton = clearAll;

    toggle.addEventListener('click', () => {
      this.enabled = !this.enabled;
      toggle.textContent = this.enabled ? 'Preview On' : 'Preview Off';
      this.render();
    });

    clearCurrent.addEventListener('click', () => this.clear('current'));
    clearAll.addEventListener('click', () => this.clear('all'));
    this.content.addEventListener('wheel', (event) => {
      if (!event.ctrlKey) {
        return;
      }

      event.preventDefault();
      const direction = event.deltaY > 0 ? -1 : 1;
      this.setZoom(this.zoom + direction * PREVIEW_ZOOM_STEP);
    }, { passive: false });

    this.render();
  }

  setCaptureSuspended(suspended: boolean): void {
    this.captureSuspended = suspended;
  }

  setPrompt(prompt: string): void {
    this.capture.setPrompt(prompt);
  }

  appendOutput(data: string): void {
    if (!this.enabled || this.captureSuspended) {
      return;
    }

    const completed = this.capture.push(data);
    if (completed.length === 0) {
      return;
    }

    this.entries.push(...completed);
    this.selectedId = completed[completed.length - 1]?.id ?? this.selectedId;
    this.render();
  }

  flushCurrentAnswer(): void {
    if (this.captureSuspended) {
      return;
    }

    const entry = this.capture.flush();
    if (!entry) {
      return;
    }

    this.entries.push(entry);
    this.selectedId = entry.id;
    this.render();
  }

  jumpToSelectedEntry(): void {
    if (this.entries.length === 0) {
      return;
    }

    this.selectedId ??= this.entries.at(-1)?.id ?? null;
    this.render();

    window.requestAnimationFrame(() => {
      this.content.scrollTo({ top: 0, behavior: 'smooth' });
      this.content.focus({ preventScroll: true });
      this.content.classList.add('preview-content-jump');

      window.setTimeout(() => {
        this.content.classList.remove('preview-content-jump');
      }, 450);
    });
  }

  private applyZoom(): void {
    this.container.style.setProperty('--preview-zoom', this.zoom.toFixed(2));
    this.content.style.fontSize = `${16 * this.zoom}px`;
    this.status.textContent = this.enabled
      ? `${this.entries.length} saved answer${this.entries.length === 1 ? '' : 's'} · ${Math.round(this.zoom * 100)}%`
      : 'Paused';
  }

  private setZoom(nextZoom: number): void {
    this.zoom = Math.min(MAX_PREVIEW_ZOOM, Math.max(MIN_PREVIEW_ZOOM, nextZoom));
    this.applyZoom();
  }

  private clear(mode: ClearMode): void {
    if (mode === 'all') {
      this.capture.reset();
      this.entries = [];
      this.selectedId = null;
      this.render();
      return;
    }

    if (!this.selectedId) {
      return;
    }

    const index = this.entries.findIndex((entry) => entry.id === this.selectedId);
    if (index === -1) {
      return;
    }

    this.entries.splice(index, 1);
    this.selectedId = this.entries[index]?.id ?? this.entries[index - 1]?.id ?? null;
    this.render();
  }

  private render(): void {
    this.container.classList.toggle('preview-disabled', !this.enabled);
    this.applyZoom();

    this.clearCurrentButton.disabled = this.entries.length === 0 || !this.selectedId;
    this.clearAllButton.disabled = this.entries.length === 0;

    this.renderHistory();
    this.renderSelectedEntry();
  }

  private renderHistory(): void {
    if (this.entries.length === 0) {
      this.historyList.innerHTML = '<div class="preview-history-empty">No answers yet</div>';
      return;
    }

    this.historyList.replaceChildren(
      ...this.entries.map((entry, index) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'preview-history-item';
        button.classList.toggle('active', entry.id === this.selectedId);

        const title = document.createElement('span');
        title.className = 'preview-history-item-title';
        title.textContent = `${index + 1}. ${entry.title}`;

        const meta = document.createElement('span');
        meta.className = 'preview-history-item-meta';
        meta.textContent = `${new Date(entry.createdAt).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit'
        })}${entry.excerpt ? ` · ${entry.excerpt}` : ''}`;

        button.append(title, meta);
        button.addEventListener('click', () => {
          this.selectedId = entry.id;
          this.render();
        });
        return button;
      })
    );
  }

  private async renderSelectedEntry(): Promise<void> {
    const selected = this.entries.find((entry) => entry.id === this.selectedId) ?? this.entries.at(-1);

    if (!selected) {
      this.content.innerHTML = `
        <div class="preview-empty">
          Completed AI answers will appear here. Thinking/status lines are hidden; use the left terminal for live interaction.
        </div>
      `;
      return;
    }

    const createdAt = new Date(selected.createdAt).toLocaleString([], {
      hour: '2-digit',
      minute: '2-digit',
      month: 'short',
      day: 'numeric'
    });

    this.content.innerHTML = `
      <header class="preview-document-header">
        <p class="preview-document-kicker">AI Answer</p>
        <h1 class="preview-document-title"></h1>
        <p class="preview-document-meta">${createdAt}</p>
      </header>
      <div class="preview-document-body"></div>
    `;

    const title = this.content.querySelector<HTMLElement>('.preview-document-title');
    const body = this.content.querySelector<HTMLElement>('.preview-document-body');

    if (!title || !body) {
      throw new Error('Preview document template failed to initialize.');
    }

    title.textContent = selected.title;
    const html = await renderMarkdownAsync(selected.normalizedContent);
    const activeSelected = this.entries.find((entry) => entry.id === this.selectedId) ?? this.entries.at(-1);
    if (activeSelected?.id !== selected.id) {
      return;
    }

    body.innerHTML = html;
    this.content.scrollTop = 0;
  }
}
