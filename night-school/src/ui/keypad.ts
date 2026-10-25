/**
 * ボタンを順に押して答える入力欄（ピアノの鍵盤・ダイヤル錠など）。
 * 必要な数だけ押すと自動で確定する。「やめる」で null を返す。
 */
export class Keypad {
  private root: HTMLDivElement;
  private promptEl: HTMLDivElement;
  private slotsEl: HTMLDivElement;
  private keysEl: HTMLDivElement;
  /** ボタンを押したとき（音を鳴らす用） */
  onPress: ((key: string, style: 'piano' | 'click') => void) | null = null;
  private resolve: ((v: string[] | null) => void) | null = null;

  constructor() {
    this.root = document.createElement('div');
    this.root.className = 'keypad';
    this.root.innerHTML = `<div class="prompt"></div><div class="slots"></div><div class="keys"></div><button class="cancel">やめる</button>`;
    this.promptEl = this.root.querySelector('.prompt')!;
    this.slotsEl = this.root.querySelector('.slots')!;
    this.keysEl = this.root.querySelector('.keys')!;
    this.root.querySelector('.cancel')!.addEventListener('click', () => this.finish(null));
    document.body.appendChild(this.root);
  }

  get active(): boolean {
    return this.resolve !== null;
  }

  ask(prompt: string, keys: string[], length: number, style: 'piano' | 'click'): Promise<string[] | null> {
    this.promptEl.textContent = prompt;
    this.root.className = `keypad on ${style}`;
    const entered: string[] = [];
    const slots = Array.from({ length }, () => {
      const s = document.createElement('span');
      this.slotsEl.appendChild(s);
      return s;
    });
    this.slotsEl.replaceChildren(...slots);
    this.keysEl.replaceChildren(
      ...keys.map((k) => {
        const b = document.createElement('button');
        b.textContent = k;
        b.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          if (!this.resolve || entered.length >= length) return;
          this.onPress?.(k, style);
          slots[entered.length].textContent = k;
          entered.push(k);
          b.classList.add('hit');
          setTimeout(() => b.classList.remove('hit'), 140);
          // 最後の音を聞かせてから確定
          if (entered.length === length) setTimeout(() => this.finish(entered), 450);
        });
        return b;
      }),
    );
    return new Promise((r) => (this.resolve = r));
  }

  private finish(v: string[] | null): void {
    const r = this.resolve;
    this.resolve = null;
    this.root.className = 'keypad';
    r?.(v);
  }
}
