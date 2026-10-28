/**
 * 入力のまとめ役。
 * - スマホ：画面左半分のドラッグ＝仮想ジョイスティック、右半分のドラッグ＝視点
 * - PC：WASD / 矢印キーで移動、マウスドラッグで視点、E で調べる、N で手帳
 *        戦闘：F またはクリック（ドラッグせずに離す）で攻撃、Shift で回避
 * ゲーム側は move / consumeLook() / onAction を見るだけでよい。
 */
export type InputAction = 'interact' | 'notebook' | 'items' | 'advance' | 'cancel' | 'up' | 'down' | 'confirm' | 'attack' | 'dodge';

const JOY_RADIUS = 56;

export class Input {
  /** -1..1 の移動入力（x=右, y=前） */
  readonly move = { x: 0, y: 0 };
  private look = { x: 0, y: 0 };
  private keys = new Set<string>();
  private listeners: ((a: InputAction) => void)[] = [];
  /** 会話中などは移動・視点を止める */
  enabled = true;

  private joyId: number | null = null;
  private joyOrigin = { x: 0, y: 0 };
  private joyVec = { x: 0, y: 0 };
  private lookId: number | null = null;
  private lookLast = { x: 0, y: 0 };
  /** マウスの「クリック」判定用（押した位置と時刻） */
  private clickStart = { x: 0, y: 0, t: 0 };
  private joyBase: HTMLDivElement;
  private joyKnob: HTMLDivElement;
  readonly isTouch: boolean;

  constructor(surface: HTMLElement) {
    this.isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;

    this.joyBase = document.createElement('div');
    this.joyBase.className = 'joy-base';
    this.joyKnob = document.createElement('div');
    this.joyKnob.className = 'joy-knob';
    this.joyBase.appendChild(this.joyKnob);
    document.body.appendChild(this.joyBase);

    surface.addEventListener('pointerdown', this.onDown);
    window.addEventListener('pointermove', this.onMove, { passive: false });
    window.addEventListener('pointerup', this.onUp);
    window.addEventListener('pointercancel', this.onUp);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.reset());
    // iOS のピンチ・ダブルタップ拡大を抑止
    document.addEventListener('gesturestart', (e) => e.preventDefault());
    document.addEventListener('dblclick', (e) => e.preventDefault());
  }

  onAction(fn: (a: InputAction) => void): void {
    this.listeners.push(fn);
  }

  emit(a: InputAction): void {
    for (const fn of this.listeners) fn(a);
  }

  /** 前回呼び出しからの視点移動量（px）を取り出す */
  consumeLook(): { x: number; y: number } {
    const v = { x: this.look.x, y: this.look.y };
    this.look.x = 0;
    this.look.y = 0;
    return v;
  }

  reset(): void {
    this.keys.clear();
    this.joyId = null;
    this.lookId = null;
    this.joyVec.x = this.joyVec.y = 0;
    this.joyBase.classList.remove('active');
    this.look.x = this.look.y = 0;
  }

  /** 毎フレーム呼ぶ：キーボードとジョイスティックを合成 */
  update(): void {
    let x = 0;
    let y = 0;
    if (this.enabled) {
      if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) y += 1;
      if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) y -= 1;
      if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1;
      if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1;
      x += this.joyVec.x;
      y += this.joyVec.y;
    }
    const len = Math.hypot(x, y);
    if (len > 1) {
      x /= len;
      y /= len;
    }
    this.move.x = x;
    this.move.y = y;
  }

  private onDown = (e: PointerEvent): void => {
    if (!this.enabled) return;
    const leftSide = e.clientX < window.innerWidth * 0.45;
    if (e.pointerType !== 'mouse' && leftSide && this.joyId === null) {
      this.joyId = e.pointerId;
      this.joyOrigin = { x: e.clientX, y: e.clientY };
      this.joyVec = { x: 0, y: 0 };
      this.joyBase.style.left = `${e.clientX}px`;
      this.joyBase.style.top = `${e.clientY}px`;
      this.joyKnob.style.transform = 'translate(-50%, -50%)';
      this.joyBase.classList.add('active');
    } else if (this.lookId === null) {
      this.lookId = e.pointerId;
      this.lookLast = { x: e.clientX, y: e.clientY };
      this.clickStart = { x: e.clientX, y: e.clientY, t: performance.now() };
    }
    e.preventDefault();
  };

  private onMove = (e: PointerEvent): void => {
    if (e.pointerId === this.joyId) {
      let dx = e.clientX - this.joyOrigin.x;
      let dy = e.clientY - this.joyOrigin.y;
      const len = Math.hypot(dx, dy);
      if (len > JOY_RADIUS) {
        dx = (dx / len) * JOY_RADIUS;
        dy = (dy / len) * JOY_RADIUS;
      }
      this.joyKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
      // 中心付近の遊び
      const n = Math.min(len, JOY_RADIUS) / JOY_RADIUS;
      const k = n < 0.12 ? 0 : (n - 0.12) / 0.88 / Math.max(n, 1e-6);
      this.joyVec.x = (dx / JOY_RADIUS) * k;
      this.joyVec.y = (-dy / JOY_RADIUS) * k;
      e.preventDefault();
    } else if (e.pointerId === this.lookId) {
      if (this.enabled) {
        this.look.x += e.clientX - this.lookLast.x;
        this.look.y += e.clientY - this.lookLast.y;
      }
      this.lookLast = { x: e.clientX, y: e.clientY };
      e.preventDefault();
    }
  };

  private onUp = (e: PointerEvent): void => {
    if (e.pointerId === this.joyId) {
      this.joyId = null;
      this.joyVec = { x: 0, y: 0 };
      this.joyBase.classList.remove('active');
    }
    if (e.pointerId === this.lookId) {
      this.lookId = null;
      // マウスでドラッグせずに素早く離したら「攻撃」
      const moved = Math.hypot(e.clientX - this.clickStart.x, e.clientY - this.clickStart.y);
      if (e.pointerType === 'mouse' && moved < 6 && performance.now() - this.clickStart.t < 300) this.emit('attack');
    }
  };

  private onKeyDown = (e: KeyboardEvent): void => {
    if (e.repeat) {
      this.keys.add(e.code);
      return;
    }
    this.keys.add(e.code);
    switch (e.code) {
      case 'KeyE':
        this.emit('interact');
        break;
      case 'KeyF':
      case 'KeyJ':
        this.emit('attack');
        break;
      case 'ShiftLeft':
      case 'ShiftRight':
      case 'KeyK':
        this.emit('dodge');
        break;
      case 'KeyN':
      case 'Tab':
        this.emit('notebook');
        e.preventDefault();
        break;
      case 'KeyI':
        this.emit('items');
        break;
      case 'Space':
      case 'Enter':
        this.emit('confirm');
        this.emit('advance');
        e.preventDefault();
        break;
      case 'Escape':
        this.emit('cancel');
        break;
      case 'ArrowUp':
      case 'KeyW':
        this.emit('up');
        break;
      case 'ArrowDown':
      case 'KeyS':
        this.emit('down');
        break;
    }
  };
}
