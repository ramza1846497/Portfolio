// 発注端末のパネル。翌日入荷する箱数を選ぶ。

import { PRODUCTS, BOX_SIZE } from '../data/products.js';
import { formatYen } from '../logic/money.js';
import { boxCost, checkOrder, MAX_BOXES_PER_ITEM } from '../systems/ordering.js';
import { SHELF_CAPACITY } from '../world/store.js';
import { backyardStock } from '../systems/inventory.js';

export function createOrderPanel(el, { game, onClose }) {
  let order = {};
  let message = '';

  el.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn || btn.disabled) return;
    const id = btn.dataset.id;
    const g = game();
    message = '';
    if (btn.dataset.action === 'close') return onClose();
    if (btn.dataset.action === 'inc') order[id] = Math.min(MAX_BOXES_PER_ITEM, (order[id] ?? 0) + 1);
    if (btn.dataset.action === 'dec') order[id] = Math.max(0, (order[id] ?? 0) - 1);
    if (btn.dataset.action === 'submit') {
      const r = g.placeOrder(order);
      if (r.ok) order = {};
      message = r.ok ? '発注しました。明日の開店前にバックヤードへ届きます。' : r.reason;
    }
    render();
  });

  function render() {
    const g = game();
    const s = g.state;
    const check = checkOrder(order, s.money, g.freeSlotsTomorrow());
    const rows = PRODUCTS.map((p) => {
      const n = order[p.id] ?? 0;
      const pending = s.pending[p.id] ?? 0;
      return `<tr>
        <td>${p.name}<small>${p.category}</small></td>
        <td class="num">${s.inventory.shelves[p.id]}/${SHELF_CAPACITY}</td>
        <td class="num">${backyardStock(s.inventory, p.id)}</td>
        <td class="num">${formatYen(boxCost(p.id))}</td>
        <td class="num">${pending ? `${pending}箱` : ''}</td>
        <td class="order__qty">
          <button type="button" class="btn btn--mini" data-action="dec" data-id="${p.id}" ${n ? '' : 'disabled'}>−</button>
          <strong>${n}</strong>
          <button type="button" class="btn btn--mini" data-action="inc" data-id="${p.id}" ${n < MAX_BOXES_PER_ITEM ? '' : 'disabled'}>＋</button>
        </td>
      </tr>`;
    }).join('');
    el.innerHTML = `
      <div class="panel__box">
        <div class="panel__head"><h2>発注端末 <small>翌日の開店前に入荷（1箱${BOX_SIZE}個）</small></h2>
          <button type="button" class="panel__close" data-action="close">閉じる（Esc）</button></div>
        <table class="order">
          <thead><tr><th>商品</th><th>棚</th><th>バックヤード</th><th>仕入れ値/箱</th><th>発注済み</th><th>箱数</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <div class="order__foot">
          <div>合計 <strong>${formatYen(check.total)}</strong>　所持金 ${formatYen(s.money)}　置き場の残り ${g.freeSlotsTomorrow()}箱</div>
          <button type="button" class="btn btn--primary" data-action="submit" ${check.ok ? '' : 'disabled'}>発注する</button>
        </div>
        <p class="order__msg">${message || (check.ok ? '' : check.reason)}</p>
      </div>`;
  }

  return {
    show() {
      order = {};
      message = '';
      el.hidden = false;
      render();
    },
    hide() {
      el.hidden = true;
    },
    update() {},
  };
}
