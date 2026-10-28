import type { Cond, StageDef } from './types';

/**
 * ゲームの状態を 1 か所で持つ：フラグ・数値変数・所持品・手帳。
 * 変更があると subscribe したリスナーに通知する。
 */
export class GameState {
  private flags = new Set<string>();
  private vars = new Map<string, number>();
  private items = new Set<string>();
  /** 手帳に記録した順 */
  readonly notes: string[] = [];
  /** まだ手帳で見ていない記録 */
  readonly unreadNotes = new Set<string>();
  private startedAt = performance.now();
  private listeners: (() => void)[] = [];

  constructor(readonly stage: StageDef) {}

  subscribe(fn: () => void): void {
    this.listeners.push(fn);
  }

  private changed(): void {
    for (const fn of this.listeners) fn();
  }

  hasFlag(name: string): boolean {
    return this.flags.has(name);
  }

  setFlag(name: string, value = true): void {
    if (value === this.flags.has(name)) return;
    if (value) this.flags.add(name);
    else this.flags.delete(name);
    this.changed();
  }

  getVar(name: string): number {
    return this.vars.get(name) ?? 0;
  }

  setVar(name: string, value: number): void {
    this.vars.set(name, value);
    this.changed();
  }

  /** 持っている物（手に入れた順） */
  get itemList(): string[] {
    return [...this.items];
  }

  hasItem(id: string): boolean {
    return this.items.has(id);
  }

  give(id: string): void {
    this.items.add(id);
    this.changed();
  }

  take(id: string): void {
    this.items.delete(id);
    this.changed();
  }

  hasNote(id: string): boolean {
    return this.notes.includes(id);
  }

  /** 手帳に記録する。新規なら true */
  addNote(id: string): boolean {
    if (this.hasNote(id)) return false;
    if (!this.stage.notes.some((n) => n.id === id)) throw new Error(`unknown note: ${id}`);
    this.notes.push(id);
    this.unreadNotes.add(id);
    this.changed();
    return true;
  }

  markNotesRead(): void {
    this.unreadNotes.clear();
    this.changed();
  }

  /** 調査時間の計測を始める */
  beginClock(): void {
    this.startedAt = performance.now();
  }

  elapsedSeconds(): number {
    return (performance.now() - this.startedAt) / 1000;
  }

  /** 条件を評価する */
  test(c: Cond | undefined): boolean {
    if (!c) return true;
    if ('flag' in c) return this.hasFlag(c.flag);
    if ('notFlag' in c) return !this.hasFlag(c.notFlag);
    if ('item' in c) return this.hasItem(c.item);
    if ('noItem' in c) return !this.hasItem(c.noItem);
    if ('note' in c) return this.hasNote(c.note);
    if ('all' in c) return c.all.every((x) => this.test(x));
    if ('any' in c) return c.any.some((x) => this.test(x));
    if ('not' in c) return !this.test(c.not);
    const v = this.getVar(c.var);
    if (c.eq !== undefined && v !== c.eq) return false;
    if (c.ne !== undefined && v === c.ne) return false;
    if (c.gte !== undefined && v < c.gte) return false;
    if (c.lt !== undefined && v >= c.lt) return false;
    return true;
  }
}
