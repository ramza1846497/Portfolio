// 在庫：棚の個数と、段ボール（バックヤード・床・手に持っている）。

import { BOX_SIZE } from '../data/products.js';
import { SHELF_CAPACITY, RACK_SLOTS } from '../world/store.js';

export function createInventory(shelves, boxes = []) {
  const inv = { shelves: { ...shelves }, boxes: [], nextBoxId: 1 };
  for (const b of boxes) addBox(inv, b.productId, b.count);
  return inv;
}

function freeRackSlot(inv) {
  const used = new Set(inv.boxes.filter((b) => b.where === 'rack').map((b) => b.slot));
  for (let i = 0; i < RACK_SLOTS.length; i++) if (!used.has(i)) return i;
  return -1;
}

export function rackFree(inv) {
  return RACK_SLOTS.length - inv.boxes.length;
}

// バックヤードに段ボールを1箱置く。置けなければ null
export function addBox(inv, productId, count = BOX_SIZE) {
  const slot = freeRackSlot(inv);
  if (slot === -1) return null;
  const b = { id: inv.nextBoxId++, productId, count, where: 'rack', slot, x: 0, z: 0 };
  inv.boxes.push(b);
  return b;
}

export function findBox(inv, id) {
  return inv.boxes.find((b) => b.id === id) ?? null;
}

export function removeBox(inv, id) {
  inv.boxes = inv.boxes.filter((b) => b.id !== id);
}

export function shelfCount(inv, productId) {
  return inv.shelves[productId] ?? 0;
}

// 段ボールから棚へ1個補充。結果: 'ok' | 'full' | 'empty' | 'mismatch'
export function restock(inv, boxItem, productId) {
  if (boxItem.productId !== productId) return 'mismatch';
  if (boxItem.count <= 0) return 'empty';
  if (shelfCount(inv, productId) >= SHELF_CAPACITY) return 'full';
  boxItem.count -= 1;
  inv.shelves[productId] = shelfCount(inv, productId) + 1;
  return 'ok';
}

export function takeFromShelf(inv, productId) {
  if (shelfCount(inv, productId) <= 0) return false;
  inv.shelves[productId] -= 1;
  return true;
}

// 客が置いていった商品を棚に戻す。満杯なら false
export function returnToShelf(inv, productId) {
  if (shelfCount(inv, productId) >= SHELF_CAPACITY) return false;
  inv.shelves[productId] = shelfCount(inv, productId) + 1;
  return true;
}

// 1日の終わり：床や手にある段ボールをバックヤードに戻し、空箱は捨てる
export function tidyBoxes(inv) {
  const keep = inv.boxes.filter((b) => b.count > 0);
  inv.boxes = [];
  for (const b of keep) {
    if (b.where === 'rack') inv.boxes.push(b);
  }
  for (const b of keep) {
    if (b.where !== 'rack') {
      const slot = freeRackSlot(inv);
      if (slot === -1) continue;
      Object.assign(b, { where: 'rack', slot });
      inv.boxes.push(b);
    }
  }
}

export function backyardStock(inv, productId) {
  return inv.boxes.filter((b) => b.productId === productId).reduce((s, b) => s + b.count, 0);
}
