// フライヤーとホットスナックのケース。時間は現実の秒。

import { FRY_BATCH } from '../data/products.js';

export const BURN_AFTER = 10;
export const CASE_LIFE = 90;
export const CASE_CAP_PER_SNACK = 8;

export function createFryer() {
  return { state: 'idle', snackId: null, t: 0, fryTime: 0 };
}

export function startFry(fryer, snack) {
  if (fryer.state !== 'idle') return false;
  Object.assign(fryer, { state: 'frying', snackId: snack.id, t: 0, fryTime: snack.fryTime });
  return true;
}

// 状態が変わったら 'done' | 'burnt' を返す
export function tickFryer(fryer, dt) {
  if (fryer.state === 'frying') {
    fryer.t += dt;
    if (fryer.t >= fryer.fryTime) {
      fryer.state = 'done';
      fryer.t = 0;
      return 'done';
    }
  } else if (fryer.state === 'done') {
    fryer.t += dt;
    if (fryer.t >= BURN_AFTER) {
      fryer.state = 'burnt';
      return 'burnt';
    }
  }
  return null;
}

export function takeOut(fryer) {
  if (fryer.state !== 'done') return null;
  const out = { snackId: fryer.snackId, count: FRY_BATCH };
  Object.assign(fryer, createFryer());
  return out;
}

export function discardBurnt(fryer) {
  if (fryer.state !== 'burnt') return null;
  const out = { snackId: fryer.snackId, count: FRY_BATCH };
  Object.assign(fryer, createFryer());
  return out;
}

export function createCase() {
  return { batches: [] };
}

export function caseCount(hc, snackId) {
  return hc.batches.filter((b) => b.snackId === snackId).reduce((s, b) => s + b.count, 0);
}

// ケースに入れる。入った個数を返す
export function addToCase(hc, snackId, count) {
  const room = CASE_CAP_PER_SNACK - caseCount(hc, snackId);
  const n = Math.max(0, Math.min(room, count));
  if (n > 0) hc.batches.push({ snackId, count: n, age: 0 });
  return n;
}

// 古いものから1個取る
export function takeFromCase(hc, snackId) {
  const b = hc.batches.find((x) => x.snackId === snackId && x.count > 0);
  if (!b) return false;
  b.count -= 1;
  hc.batches = hc.batches.filter((x) => x.count > 0);
  return true;
}

// 時間切れで廃棄になった分を返す
export function tickCase(hc, dt) {
  const expired = [];
  for (const b of hc.batches) {
    b.age += dt;
    if (b.age >= CASE_LIFE) expired.push({ snackId: b.snackId, count: b.count });
  }
  if (expired.length) hc.batches = hc.batches.filter((b) => b.age < CASE_LIFE);
  return expired;
}

export function emptyCase(hc) {
  const all = hc.batches.map((b) => ({ snackId: b.snackId, count: b.count }));
  hc.batches = [];
  return all;
}
