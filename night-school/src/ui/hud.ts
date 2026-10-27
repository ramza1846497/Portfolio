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
  private vitals: HTMLDivElement;
  private hpFill: HTMLDivElement;
  private hpBar: HTMLDivElement;
  private meterCanvas: HTMLCanvasElement;
  private meterCtx: CanvasRenderingContext2D;
  private meterLabel: HTMLDivElement;
  private hurtEl: HTMLDivElement;
  private lowEl: HTMLDivElement;
  private drainEl: HTMLDivElement;

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

    // 体力ゲージと怪異メーター
    this.vitals = el('div', 'vitals', this.root);
    const hp = el('div', 'hp', this.vitals, '<span class="cap">体力</span>');
    this.hpBar = el('div', 'hp-bar', hp);
    this.hpFill = el('div', 'hp-fill', this.hpBar);
    const meter = el('div', 'meter', this.vitals);
    this.meterCanvas = el('canvas', 'meter-dial', meter);
    this.meterCanvas.width = 120;
    this.meterCanvas.height = 68;
    this.meterCtx = this.meterCanvas.getContext('2d')!;
    this.meterLabel = el('div', 'meter-cap', meter, '怪異');
    this.hurtEl = el('div', 'hurt', document.body);
    this.lowEl = el('div', 'low-hp', document.body);
    this.drainEl = el('div', 'drain', document.body);
    this.drawMeter(0);
  }

  /** 体力（0..1） */
  setHp(ratio: number): void {
    const r = Math.max(0, Math.min(1, ratio));
    this.hpFill.style.width = `${r * 100}%`;
    this.hpBar.classList.toggle('danger', r <= 0.3);
    this.lowEl.classList.toggle('on', r <= 0.3);
  }

  /** 持続ダメージ中の赤み（0..1） */
  setDrain(level: number): void {
    this.drainEl.style.opacity = String(Math.max(0, Math.min(1, level)) * 0.75);
  }

  showVitals(v: boolean): void {
    this.vitals.style.display = v ? '' : 'none';
  }

  /** ダメージの赤い明滅。amount は最大体力に対する割合 */
  hurtFlash(amount: number): void {
    this.hurtEl.style.transition = 'none';
    this.hurtEl.style.opacity = String(Math.min(0.85, 0.35 + amount));
    void this.hurtEl.offsetWidth;
    this.hurtEl.style.transition = 'opacity 1.2s';
    this.hurtEl.style.opacity = '0';
  }

  /** 怪異メーターの針（0..1）。毎フレーム呼ぶ */
  drawMeter(level: number): void {
    const ctx = this.meterCtx;
    const cx = 60;
    const cy = 62;
    const r = 52;
    ctx.clearRect(0, 0, 120, 68);
    // 目盛りの帯：静か → 気配 → 危険
    const zones: [number, number, string][] = [
      [0, 0.45, 'rgba(120,160,130,0.55)'],
      [0.45, 0.75, 'rgba(200,170,80,0.65)'],
      [0.75, 1, 'rgba(190,50,40,0.8)'],
    ];
    const ang = (t: number) => Math.PI + t * Math.PI;
    ctx.lineWidth = 6;
    for (const [a, b, col] of zones) {
      ctx.strokeStyle = col;
      ctx.beginPath();
      ctx.arc(cx, cy, r, ang(a), ang(b));
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(232,228,216,0.5)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 10; i++) {
      const a = ang(i / 10);
      const r1 = i % 5 === 0 ? r - 12 : r - 8;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
      ctx.lineTo(cx + Math.cos(a) * (r - 3), cy + Math.sin(a) * (r - 3));
      ctx.stroke();
    }
    // 針
    const a = ang(Math.max(0, Math.min(1, level)));
    ctx.strokeStyle = level > 0.75 ? '#ff5a44' : '#e8e4d8';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(a) * (r - 6), cy + Math.sin(a) * (r - 6));
    ctx.stroke();
    ctx.fillStyle = '#e8e4d8';
    ctx.beginPath();
    ctx.arc(cx, cy, 3, 0, Math.PI * 2);
    ctx.fill();
    this.meterLabel.classList.toggle('alert', level > 0.75);
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
