import type { GameState } from '../game/state';

/** 調査手帳：集めた手がかりを一覧する */
export class Notebook {
  private root: HTMLDivElement;
  private body: HTMLDivElement;
  onClose: (() => void) | null = null;
  private openedAt = 0;

  constructor(private state: GameState) {
    this.root = document.createElement('div');
    this.root.className = 'notebook';
    this.root.innerHTML = `<div class="book"><button class="close" aria-label="閉じる">×</button><h2>調査手帳</h2><div class="body"></div></div>`;
    this.body = this.root.querySelector('.body')!;
    document.body.appendChild(this.root);
    this.root.querySelector('.close')!.addEventListener('click', () => this.close());
    // 手帳の外側をタップしても閉じる
    // （開いたボタンのタップの click がそのまま届くので、直後は無視する）
    this.root.addEventListener('click', (e) => {
      if (e.target === this.root && performance.now() - this.openedAt > 400) this.close();
    });
  }

  get isOpen(): boolean {
    return this.root.classList.contains('on');
  }

  toggle(): void {
    if (this.isOpen) this.close();
    else this.open();
  }

  open(): void {
    const { stage, notes, unreadNotes } = this.state;
    const total = stage.notes.length;
    let html = `<div class="count">記録 ${notes.length} / ${total}</div>`;
    if (notes.length === 0) html += `<p class="empty">まだ何も記録していない。気になる物を調べてみよう。</p>`;
    // 新しい記録を上に
    for (const id of [...notes].reverse()) {
      const n = stage.notes.find((x) => x.id === id)!;
      html += `<div class="entry${unreadNotes.has(id) ? ' new' : ''}"><h3>${n.title}</h3><p>${n.body}</p></div>`;
    }
    this.body.innerHTML = html;
    this.root.classList.add('on');
    this.openedAt = performance.now();
    this.state.markNotesRead();
  }

  close(): void {
    if (!this.isOpen) return;
    this.root.classList.remove('on');
    this.onClose?.();
  }
}
