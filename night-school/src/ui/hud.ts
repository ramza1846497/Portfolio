import type { Input } from '../engine/input';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent: HTMLElement, html = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  if (html) e.innerHTML = html;
  parent.appendChild(e);
  return e;
}

/** 照準・対象名・目的・ボタン類 */
export class Hud {
  readonly root: HTMLDivElement;
  private crosshair: HTMLDivElement;
  private label: HTMLDivElement;
  private objective: HTMLDivElement;
  private interactBtn: HTMLButtonElement;
  private badge: HTMLSpanElement;
  private toastEl: HTMLDivElement;
  private toastTimer = 0;
  readonly fade: HTMLDivElement;

  constructor(input: Input) {
    this.root = el('div', 'hud', document.body);
    el('div', 'vignette', document.body);
    this.crosshair = el('div', 'crosshair', this.root);
    this.label = el('div', 'target-label', this.root);
    this.objective = el('div', 'objective', this.root);
    el('div', 'joy-hint', this.root, '移動');
    el('div', 'rotate-hint', this.root, '横向きがおすすめです');
    el('div', 'pc-help', this.root, 'WASD 移動 ／ ドラッグ 視点<br>E 調べる ／ N 手帳');

    this.interactBtn = el('button', 'hud-btn btn-interact', this.root, '調べる');
    const nb = el('button', 'hud-btn btn-notebook', this.root, '手帳');
    this.badge = el('span', 'badge', nb, '0');
    this.badge.style.display = 'none';

    // タッチの反応を速くするため pointerdown で発火
    const press = (btn: HTMLElement, action: 'interact' | 'notebook') => {
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        input.emit(action);
      });
    };
    press(this.interactBtn, 'interact');
    press(nb, 'notebook');

    this.toastEl = el('div', 'toast', document.body);
    this.fade = el('div', 'fade', document.body);
  }

  setTarget(name: string | null): void {
    const on = name !== null;
    this.crosshair.classList.toggle('on', on);
    this.label.classList.toggle('on', on);
    this.interactBtn.classList.toggle('on', on);
    if (on) this.label.textContent = name;
  }

  setObjective(text: string): void {
    this.objective.innerHTML = `目的：<b>${text}</b>`;
  }

  setNoteCount(n: number): void {
    this.badge.textContent = String(n);
    this.badge.style.display = n > 0 ? 'inline-block' : 'none';
  }

  setVisible(v: boolean): void {
    this.root.style.display = v ? '' : 'none';
  }

  toast(text: string): void {
    this.toastEl.textContent = text;
    this.toastEl.classList.add('on');
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toastEl.classList.remove('on'), 2400);
  }
}
