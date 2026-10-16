// 硬貨・紙幣のボタンとトレイの表示（レジパネルで使う）

import { CHANGE_DENOMINATIONS } from '../logic/money.js';

export function moneyToken(value) {
  const kind = value >= 1000 ? 'bill' : 'coin';
  return `<span class="money money--${kind} money--y${value}">${value}</span>`;
}

export function padHtml(disabled) {
  return CHANGE_DENOMINATIONS.map(
    (v) => `<button type="button" class="pad__btn${v >= 1000 ? ' pad__btn--bill' : ''}" data-action="money" data-value="${v}" ${disabled ? 'disabled' : ''} aria-label="${v}円">${moneyToken(v)}</button>`,
  ).join('');
}

export function trayHtml(tray) {
  if (tray.length === 0) return '<span class="tray__empty">お金ボタンでお釣りを置きます</span>';
  const counts = new Map();
  for (const v of tray) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.keys()]
    .sort((a, b) => b - a)
    .map((v) => {
      const n = counts.get(v);
      return `<button type="button" class="tray__stack" data-action="unmoney" data-value="${v}" aria-label="${v}円を1枚戻す">${moneyToken(v)}${n > 1 ? `<span class="tray__count">×${n}</span>` : ''}</button>`;
    })
    .join('');
}
