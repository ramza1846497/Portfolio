import type { TutorialDef } from '../game/types';

/** 操作説明のパネル。閉じるまで待つ */
export class Tutorial {
  private root: HTMLDivElement;
  private resolve: (() => void) | null = null;
  private openedAt = 0;

  constructor(private isTouch: boolean) {
    this.root = document.createElement('div');
    this.root.className = 'tutorial';
    document.body.appendChild(this.root);
  }

  get active(): boolean {
    return this.resolve !== null;
  }

  show(def: TutorialDef): Promise<void> {
    const lines = [...(this.isTouch ? def.touch : def.pc), ...(def.common ?? [])];
    this.root.innerHTML = `<div class="panel"><h2>${def.title}</h2><ul>${lines.map((l) => `<li>${l}</li>`).join('')}</ul><button>わかった</button></div>`;
    this.root.classList.add('on');
    this.openedAt = performance.now();
    const btn = this.root.querySelector('button')!;
    btn.addEventListener('click', () => this.close());
    return new Promise((r) => (this.resolve = r));
  }

  /** キー入力でも閉じられる（開いた直後の連打は無視） */
  confirm(): void {
    if (this.active && performance.now() - this.openedAt > 500) this.close();
  }

  private close(): void {
    this.root.classList.remove('on');
    const r = this.resolve;
    this.resolve = null;
    r?.();
  }
}
