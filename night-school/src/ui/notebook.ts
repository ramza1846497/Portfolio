import type { GameState } from '../game/state';

export type NotebookTab = 'items' | 'notes';

/** 調査手帳：持ち物と、集めた手がかりを一覧する */
export class Notebook {
  private root: HTMLDivElement;
  private body: HTMLDivElement;
  private tabs: Record<NotebookTab, HTMLButtonElement>;
  private tab: NotebookTab = 'notes';
  onClose: (() => void) | null = null;
  /** 持ち物の「使う」を押したとき */
  onUse: ((id: string) => void) | null = null;
  private openedAt = 0;

  constructor(private state: GameState) {
    this.root = document.createElement('div');
    this.root.className = 'notebook';
    this.root.innerHTML = `<div class="book"><button class="close" aria-label="閉じる">×</button><h2>調査手帳</h2><div class="tabs"><button data-tab="items">持ち物</button><button data-tab="notes">記録</button></div><div class="body"></div></div>`;
    this.body = this.root.querySelector('.body')!;
    document.body.appendChild(this.root);
    this.tabs = {
      items: this.root.querySelector('[data-tab="items"]')!,
      notes: this.root.querySelector('[data-tab="notes"]')!,
    };
    for (const t of ['items', 'notes'] as const) this.tabs[t].addEventListener('click', () => this.show(t));
    this.root.querySelector('.close')!.addEventListener('click', () => this.close());
    this.body.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-use]');
      if (btn && performance.now() - this.openedAt > 400) this.onUse?.(btn.dataset.use!);
    });
    // 手帳の外側をタップしても閉じる
    // （開いたボタンのタップの click がそのまま届くので、直後は無視する）
    this.root.addEventListener('click', (e) => {
      if (e.target === this.root && performance.now() - this.openedAt > 400) this.close();
    });
  }

  get isOpen(): boolean {
    return this.root.classList.contains('on');
  }

  /** 使える持ち物の数（HUD の印に出す） */
  get usableCount(): number {
    return this.state.itemList.filter((id) => this.state.stage.items.find((x) => x.id === id)?.use).length;
  }

  open(tab: NotebookTab = 'notes'): void {
    this.root.classList.add('on');
    this.openedAt = performance.now();
    this.show(tab);
  }

  private show(tab: NotebookTab): void {
    this.tab = tab;
    for (const t of ['items', 'notes'] as const) this.tabs[t].classList.toggle('sel', t === tab);
    this.body.innerHTML = tab === 'items' ? this.itemsHtml() : this.notesHtml();
    this.body.parentElement!.scrollTop = 0;
    if (tab === 'notes') this.state.markNotesRead();
  }

  private itemsHtml(): string {
    const { stage, itemList } = this.state;
    if (itemList.length === 0) return `<p class="empty">何も持っていない。</p>`;
    let html = '';
    for (const id of [...itemList].reverse()) {
      const it = stage.items.find((x) => x.id === id)!;
      html += `<div class="entry item"><div><h3>${it.name}</h3>${it.desc ? `<p>${it.desc}</p>` : ''}</div>${it.use ? `<button class="use" data-use="${it.id}">使う</button>` : ''}</div>`;
    }
    return html;
  }

  private notesHtml(): string {
    const { stage, notes, unreadNotes } = this.state;
    let html = `<div class="count">記録 ${notes.length} / ${stage.notes.length}</div>`;
    if (notes.length === 0) html += `<p class="empty">まだ何も記録していない。気になる物を調べてみよう。</p>`;
    // 新しい記録を上に
    for (const id of [...notes].reverse()) {
      const n = stage.notes.find((x) => x.id === id)!;
      html += `<div class="entry${unreadNotes.has(id) ? ' new' : ''}"><h3>${n.title}</h3><p>${n.body}</p></div>`;
    }
    return html;
  }

  get currentTab(): NotebookTab {
    return this.tab;
  }

  close(): void {
    if (!this.isOpen) return;
    this.root.classList.remove('on');
    this.onClose?.();
  }
}
