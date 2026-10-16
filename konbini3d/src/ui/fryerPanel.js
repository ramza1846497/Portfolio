// フライヤーで揚げる商品を選ぶ小さなパネル

import { HOTSNACKS, FRY_BATCH } from '../data/products.js';
import { formatYen } from '../logic/money.js';

export function createFryerPanel(el, { game, onClose }) {
  el.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    if (btn.dataset.action === 'fry') game().startFrying(btn.dataset.id);
    onClose();
  });

  function render() {
    el.innerHTML = `
      <div class="panel__box panel__box--small">
        <div class="panel__head"><h2>フライヤー <small>何を揚げますか？（${FRY_BATCH}個ずつ）</small></h2>
          <button type="button" class="panel__close" data-action="close">閉じる（Esc）</button></div>
        <div class="fry">
          ${HOTSNACKS.map((s) => `<button type="button" class="btn fry__btn" data-action="fry" data-id="${s.id}">
            <strong>${s.name}</strong><span>売値 ${formatYen(s.price)} ／ 材料費 ${formatYen(s.cost * FRY_BATCH)}</span><span>揚げ時間 ${s.fryTime}秒</span></button>`).join('')}
        </div>
        <p class="fry__note">揚がったら10秒以内に取り出して、ホットケースに並べましょう。ケースでは90秒で廃棄になります。</p>
      </div>`;
  }

  return {
    show() {
      el.hidden = false;
      render();
    },
    hide() {
      el.hidden = true;
    },
    update() {},
  };
}
