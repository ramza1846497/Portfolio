// レジ会計（1人分の会計の状態と操作）。DOMやThree.jsには触らない。

import { CHANGE_DENOMINATIONS, calcChange, judge, JUDGE, sumMoney } from '../logic/money.js';
import { PRODUCT_BY_ID, SNACK_BY_ID } from '../data/products.js';

const MAX_TRAY = 40;

export function startCheckout(customer) {
  return {
    customerId: customer.id,
    items: customer.carrying.map((productId) => ({ productId, scanned: false })),
    hot: customer.hotOrder ? [{ snackId: customer.hotOrder, status: 'pending' }] : [],
    phase: 'scan',
    total: 0,
    payment: null,
    payTimer: 0,
    change: null,
    tray: [],
    addChecked: false,
    result: null,
  };
}

export function scanItem(co, index) {
  const item = co.items[index];
  if (co.phase !== 'scan' || !item || item.scanned) return false;
  item.scanned = true;
  co.total += PRODUCT_BY_ID[item.productId].price;
  return true;
}

export function addHotOrder(co, snackId) {
  co.hot.push({ snackId, status: 'pending' });
}

// taken: ケースから取れたか
export function resolveHot(co, index, taken) {
  const h = co.hot[index];
  if (co.phase !== 'scan' || !h || h.status !== 'pending') return false;
  h.status = taken ? 'taken' : 'soldout';
  if (taken) co.total += SNACK_BY_ID[h.snackId].price;
  return true;
}

export function readyToPay(co) {
  return co.phase === 'scan' && co.items.every((i) => i.scanned) && co.hot.every((h) => h.status !== 'pending') && co.total > 0;
}

export function beginPayment(co, type, rng) {
  if (!readyToPay(co)) return false;
  co.phase = 'paying';
  co.payment = type.pay(co.total, rng);
  co.payTimer = type.payDelay;
  return true;
}

export function tickPayment(co, dt) {
  if (co.phase !== 'paying') return false;
  co.payTimer -= dt;
  if (co.payTimer > 0) return false;
  co.phase = 'change';
  co.change = calcChange(co.total, co.payment.paid);
  return true;
}

export function addMoney(co, value) {
  if (co.phase === 'scan' || co.phase === 'done' || !CHANGE_DENOMINATIONS.includes(value)) return false;
  if (co.tray.length >= MAX_TRAY) return false;
  co.tray.push(value);
  return true;
}

export function removeMoney(co, value) {
  const i = co.tray.lastIndexOf(value);
  if (i === -1 || co.phase === 'done') return false;
  co.tray.splice(i, 1);
  return true;
}

export function clearTray(co) {
  if (co.phase === 'done') return;
  co.tray = [];
}

// 渡す。売上・差額（損失）・正誤を返す
export function settle(co) {
  if (co.phase !== 'change') return null;
  const verdict = judge(co.tray, co.change);
  const given = sumMoney(co.tray);
  const diff = Math.abs(given - co.change);
  co.phase = 'done';
  co.result = { ok: verdict.result !== JUDGE.WRONG, perfect: verdict.result === JUDGE.PERFECT, diff, total: co.total, given };
  return co.result;
}
