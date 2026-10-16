// セーブ（日数・所持金・在庫・発注）。localStorage が使えなくても遊べるようにする。

import { SAVE_VERSION } from './game.js';
import { PRODUCT_BY_ID } from './data/products.js';

const KEY = 'konbini3d.save';

function isValid(s) {
  return (
    s && s.version === SAVE_VERSION && Number.isInteger(s.day) && s.day >= 1 && Number.isInteger(s.money) &&
    s.shelves && typeof s.shelves === 'object' && Array.isArray(s.boxes) &&
    s.boxes.every((b) => PRODUCT_BY_ID[b.productId] && Number.isInteger(b.count)) &&
    s.pending && typeof s.pending === 'object'
  );
}

export function loadSave() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    return isValid(data) ? data : null;
  } catch {
    return null;
  }
}

export function writeSave(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // 使えない環境では何もしない
  }
}
