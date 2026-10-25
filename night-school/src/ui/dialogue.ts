import type { Line } from '../game/types';

const CHAR_MS: Record<NonNullable<Line['style']>, number> = {
  normal: 38,
  whisper: 60,
  ghost: 140,
  system: 22,
};

/** タイプライター表示の会話ウィンドウと選択肢 */
export class Dialogue {
  private box: HTMLDivElement;
  private speakerEl: HTMLDivElement;
  private textEl: HTMLDivElement;
  private choicesEl: HTMLDivElement;
  private typing = false;
  private full = '';
  private timer = 0;
  private resolveLine: (() => void) | null = null;
  private resolveChoice: ((i: number) => void) | null = null;
  private choiceButtons: HTMLButtonElement[] = [];
  private selected = 0;
  private lastAdvance = 0;
  /** 1 文字表示するたびに呼ばれる（効果音用） */
  onChar: ((style: string) => void) | null = null;

  constructor() {
    this.box = document.createElement('div');
    this.box.className = 'dialogue';
    this.speakerEl = document.createElement('div');
    this.speakerEl.className = 'speaker';
    this.textEl = document.createElement('div');
    this.textEl.className = 'text';
    const next = document.createElement('div');
    next.className = 'next';
    next.textContent = '▼ タップで次へ';
    this.box.append(this.speakerEl, this.textEl, next);
    document.body.appendChild(this.box);

    this.choicesEl = document.createElement('div');
    this.choicesEl.className = 'choices';
    document.body.appendChild(this.choicesEl);

    // 会話中は画面のどこをタップしても送れる
    window.addEventListener(
      'pointerdown',
      (e) => {
        if (!this.resolveLine) return;
        if ((e.target as HTMLElement).closest('.choices')) return;
        e.preventDefault();
        this.advance();
      },
      { capture: true },
    );
  }

  get active(): boolean {
    return this.resolveLine !== null || this.resolveChoice !== null;
  }

  /** 1 行を表示し、プレイヤーが送るまで待つ */
  line(line: Line, keepOpen = false): Promise<void> {
    const style = line.style ?? 'normal';
    this.box.className = `dialogue on ${style}`;
    this.speakerEl.textContent = line.speaker ?? '';
    this.full = line.text;
    this.textEl.textContent = '';
    this.typing = true;
    let i = 0;
    const step = () => {
      if (!this.typing) return;
      i++;
      this.textEl.textContent = this.full.slice(0, i);
      const ch = this.full[i - 1];
      if (ch && ch.trim() && ch !== '…') this.onChar?.(style);
      if (i >= this.full.length) {
        this.finishTyping();
        return;
      }
      const pause = '。、！？…'.includes(ch) ? 4 : 1;
      this.timer = window.setTimeout(step, CHAR_MS[style] * pause);
    };
    this.timer = window.setTimeout(step, 60);
    return new Promise((resolve) => {
      this.resolveLine = () => {
        this.resolveLine = null;
        if (!keepOpen) this.hide();
        resolve();
      };
    });
  }

  /** 選択肢を出して、選ばれた番号を返す。prompt は会話欄に出す */
  choose(labels: string[], prompt?: string): Promise<number> {
    if (prompt) {
      this.box.className = 'dialogue on system';
      this.speakerEl.textContent = '';
      this.textEl.textContent = prompt;
    }
    this.choicesEl.innerHTML = '';
    this.choiceButtons = labels.map((label, i) => {
      const b = document.createElement('button');
      b.textContent = label;
      b.addEventListener('pointerenter', () => this.select(i));
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        this.pick(i);
      });
      this.choicesEl.appendChild(b);
      return b;
    });
    this.select(0);
    this.choicesEl.classList.add('on');
    return new Promise((resolve) => {
      this.resolveChoice = (i) => {
        this.resolveChoice = null;
        this.choicesEl.classList.remove('on');
        this.hide();
        resolve(i);
      };
    });
  }

  /** キー入力：決定・上下 */
  key(action: 'advance' | 'up' | 'down' | 'confirm'): void {
    if (this.resolveChoice) {
      if (action === 'up') this.select((this.selected + this.choiceButtons.length - 1) % this.choiceButtons.length);
      else if (action === 'down') this.select((this.selected + 1) % this.choiceButtons.length);
      else if (action === 'confirm') this.pick(this.selected);
      return;
    }
    if (action === 'advance') this.advance();
  }

  advance(): void {
    // ボタンとキーが同時に来ても 2 行送らない
    const now = performance.now();
    if (now - this.lastAdvance < 150) return;
    this.lastAdvance = now;
    if (this.typing) {
      this.finishTyping();
      return;
    }
    this.resolveLine?.();
  }

  hide(): void {
    this.box.className = 'dialogue';
  }

  private finishTyping(): void {
    clearTimeout(this.timer);
    this.typing = false;
    this.textEl.textContent = this.full;
    this.box.classList.add('done');
  }

  private select(i: number): void {
    this.selected = i;
    this.choiceButtons.forEach((b, k) => b.classList.toggle('sel', k === i));
  }

  private pick(i: number): void {
    this.resolveChoice?.(i);
  }
}
