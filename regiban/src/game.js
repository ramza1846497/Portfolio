// ゲーム進行（状態・タイマー・スコア）。DOMには触らない。

import { createRng } from './rng.js';
import { CHANGE_DENOMINATIONS, calcChange, judge, JUDGE } from './money.js';
import { createCustomer, addItemTo, payDelayOf } from './customers.js';

export const SHIFT_MS = 120_000;
const LEAVE_MS = 800;
// タブが裏に回った等で時間が飛んだときは進めすぎない
const MAX_STEP_MS = 250;
const MAX_TRAY = 40;

export const SCORE = Object.freeze({
  CORRECT: 100,
  PERFECT: 50,
  SPEED_PER_SEC: 10,
  MISS: -50,
  COMBO: 20,
});

// streak は今回より前の連続正解数
export function scoreForSuccess(result, patienceLeftSec, streak) {
  return (
    SCORE.CORRECT +
    (result === JUDGE.PERFECT ? SCORE.PERFECT : 0) +
    Math.floor(patienceLeftSec) * SCORE.SPEED_PER_SEC +
    streak * SCORE.COMBO
  );
}

const MANAGER_COMMENTS = [
  { min: 5000, lines: ['きみ、来月から副店長ね。', 'レジの神様が降りてきてたよ…！', '常連さんがきみの名前を覚えたってさ。'] },
  { min: 3000, lines: ['いやあ、頼もしい！また入ってよ。', 'お釣りの手さばき、見とれちゃったよ。', 'ピーク時もこれなら安心だ。'] },
  { min: 1500, lines: ['うん、いい感じ。慣れてきたね。', '次は連続正解をねらってみよう。', 'その調子！あと少しでベテランだ。'] },
  { min: 500, lines: ['まずまずだね。焦らずいこう。', '急いでる客には先に手を動かそう。', 'お釣りは大きいお金から置くと早いよ。'] },
  { min: 0, lines: ['…今日はたまたま混んでたよね。', 'だいじょうぶ、最初はみんなこんなもん。', 'まずは深呼吸。お釣りは逃げないよ。'] },
];

export function managerComment(score, rng) {
  const band = MANAGER_COMMENTS.find((b) => score >= b.min);
  return rng.pick(band.lines);
}

export class Game {
  constructor({ seed = Date.now(), onEvent = () => {} } = {}) {
    this.rng = createRng(seed);
    this.onEvent = onEvent;
    this.lastNow = null;
    this.serial = 0;
    this.state = {
      phase: 'ready',
      elapsedMs: 0,
      timeLeftMs: SHIFT_MS,
      score: 0,
      served: 0,
      correct: 0,
      perfect: 0,
      miss: 0,
      combo: 0,
      maxCombo: 0,
      customer: null,
      tray: [],
    };
  }

  emit(type, payload) {
    this.onEvent(type, payload);
  }

  start(now) {
    this.state.phase = 'playing';
    this.lastNow = now;
    this.spawnCustomer();
  }

  update(now) {
    const s = this.state;
    if (s.phase !== 'playing') return;
    const dt = Math.min(Math.max(now - this.lastNow, 0), MAX_STEP_MS);
    this.lastNow = now;
    s.elapsedMs += dt;
    s.timeLeftMs = Math.max(0, SHIFT_MS - s.elapsedMs);
    if (s.timeLeftMs === 0) {
      this.finish();
      return;
    }
    this.updateCustomer(dt);
  }

  updateCustomer(dt) {
    const s = this.state;
    const c = s.customer;
    if (c.status === 'paying') {
      if (s.elapsedMs >= c.statusEndsAt) this.revealPayment();
    } else if (c.status === 'waiting') {
      c.patienceLeftMs = Math.max(0, c.patienceLeftMs - dt);
      if (c.addAt !== null && s.elapsedMs >= c.addAt) this.applyAddItem();
      if (c.patienceLeftMs === 0) this.resolveMiss('timeout');
    } else if (c.status === 'leaving') {
      if (s.elapsedMs >= c.statusEndsAt) this.spawnCustomer();
    }
  }

  spawnCustomer() {
    const s = this.state;
    const data = createCustomer(this.rng, s.elapsedMs / 1000);
    const { lines } = data.type;
    s.customer = {
      ...data,
      serial: ++this.serial,
      status: 'paying',
      statusEndsAt: s.elapsedMs + payDelayOf(data.type),
      patienceMs: data.type.patience * 1000,
      patienceLeftMs: data.type.patience * 1000,
      change: null,
      addAt: null,
      result: null,
      line: this.rng.pick(lines.paying ?? lines.enter),
    };
    s.tray = [];
    this.emit('customer', s.customer);
  }

  revealPayment() {
    const c = this.state.customer;
    c.status = 'waiting';
    c.change = calcChange(c.total, c.payment.paid);
    if (c.type.lines.paying) c.line = this.rng.pick(c.type.lines.enter);
    if (c.type.addItem) c.addAt = this.state.elapsedMs + c.type.addItem.delayMs;
    this.emit('paid', c);
  }

  // トレイはそのまま、合計・預かり・お釣りだけ更新する
  applyAddItem() {
    const c = this.state.customer;
    const next = addItemTo(c, this.rng);
    c.items = next.items;
    c.total = next.total;
    c.payment = next.payment;
    c.change = calcChange(c.total, c.payment.paid);
    c.addAt = null;
    c.line = this.rng.pick(c.type.lines.add);
    this.emit('add', { customer: c, added: next.added });
  }

  canEditTray() {
    const c = this.state.customer;
    return this.state.phase === 'playing' && c && c.status !== 'leaving';
  }

  addMoney(value) {
    if (!this.canEditTray() || !CHANGE_DENOMINATIONS.includes(value)) return;
    if (this.state.tray.length >= MAX_TRAY) return;
    this.state.tray.push(value);
    this.emit('tray', this.state.tray);
  }

  removeMoney(value) {
    if (!this.canEditTray()) return;
    const index = this.state.tray.lastIndexOf(value);
    if (index === -1) return;
    this.state.tray.splice(index, 1);
    this.emit('tray', this.state.tray);
  }

  clearTray() {
    if (!this.canEditTray() || this.state.tray.length === 0) return;
    this.state.tray = [];
    this.emit('tray', this.state.tray);
  }

  submit() {
    const s = this.state;
    const c = s.customer;
    if (s.phase !== 'playing' || !c || c.status !== 'waiting') return;
    const verdict = judge(s.tray, c.change);
    if (verdict.result === JUDGE.WRONG) this.resolveMiss('wrong', verdict);
    else this.resolveSuccess(verdict);
  }

  resolveSuccess(verdict) {
    const s = this.state;
    const points = scoreForSuccess(verdict.result, s.customer.patienceLeftMs / 1000, s.combo);
    s.score += points;
    s.combo += 1;
    s.maxCombo = Math.max(s.maxCombo, s.combo);
    s.correct += 1;
    if (verdict.result === JUDGE.PERFECT) s.perfect += 1;
    s.served += 1;
    this.leave({ kind: 'success', perfect: verdict.result === JUDGE.PERFECT, points, verdict });
  }

  resolveMiss(reason, verdict = null) {
    const s = this.state;
    const before = s.score;
    s.score = Math.max(0, s.score + SCORE.MISS);
    s.combo = 0;
    s.miss += 1;
    s.served += 1;
    this.leave({ kind: 'fail', reason, points: s.score - before, verdict });
  }

  leave(result) {
    const c = this.state.customer;
    c.status = 'leaving';
    c.statusEndsAt = this.state.elapsedMs + LEAVE_MS;
    c.result = result;
    c.line = this.rng.pick(result.kind === 'success' ? c.type.lines.success : c.type.lines.fail);
    this.emit('result', result);
  }

  // 対応中の客は判定せずに終了
  finish() {
    const s = this.state;
    s.phase = 'ended';
    this.emit('end', this.result());
  }

  result() {
    const { score, served, correct, perfect, miss, maxCombo } = this.state;
    return { score, served, correct, perfect, miss, maxCombo };
  }
}
