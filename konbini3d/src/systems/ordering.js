// 発注：翌日入荷する箱数を決める。仕入れ値は発注時に払う。

import { BOX_SIZE, PRODUCT_BY_ID } from '../data/products.js';

export const MAX_BOXES_PER_ITEM = 6;

export function boxCost(productId) {
  return PRODUCT_BY_ID[productId].cost * BOX_SIZE;
}

export function orderTotal(order) {
  return Object.entries(order).reduce((sum, [id, n]) => sum + boxCost(id) * n, 0);
}

export function orderBoxes(order) {
  return Object.values(order).reduce((sum, n) => sum + n, 0);
}

// 発注できるか。理由つきで返す
export function checkOrder(order, money, freeSlots) {
  const total = orderTotal(order);
  const boxes = orderBoxes(order);
  if (boxes === 0) return { ok: false, reason: '箱数を選んでください', total };
  if (total > money) return { ok: false, reason: '所持金が足りません', total };
  if (boxes > freeSlots) return { ok: false, reason: `バックヤードに置けるのはあと${freeSlots}箱です`, total };
  return { ok: true, reason: '', total };
}

export function mergeOrder(pending, order) {
  const merged = { ...pending };
  for (const [id, n] of Object.entries(order)) if (n > 0) merged[id] = (merged[id] ?? 0) + n;
  return merged;
}
