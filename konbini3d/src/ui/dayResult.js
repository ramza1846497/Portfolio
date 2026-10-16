// 1日の結果画面

import { formatYen } from '../logic/money.js';

export function createDayResult(el, { onNext, onRestart }) {
  el.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    if (btn.dataset.action === 'next') onNext();
    if (btn.dataset.action === 'restart') onRestart();
  });

  return {
    show(r) {
      const row = (label, value, cls = '') => `<div class="result__row ${cls}"><dt>${label}</dt><dd>${value}</dd></div>`;
      el.innerHTML = `
        <div class="overlay__box result">
          <h2>${r.day}日目の営業結果</h2>
          <dl class="result__list">
            ${row('売上', formatYen(r.sales))}
            ${row('仕入れ（発注・材料費）', `−${formatYen(r.purchases)}`)}
            ${row('レジの差額', r.discrepancy ? `−${formatYen(r.discrepancy)}` : '0円')}
            ${row('利益', `${r.profit < 0 ? '−' : ''}${formatYen(Math.abs(r.profit))}`, `result__row--big ${r.profit < 0 ? 'is-ng' : 'is-ok'}`)}
            ${row('廃棄（原価・仕入れに含む）', formatYen(r.waste))}
            ${row('所持金', `${r.money < 0 ? '−' : ''}${formatYen(Math.abs(r.money))}`, 'result__row--big')}
            ${row('来店客数', `${r.visitors}人`)}
            ${row('満足して帰った客', `${r.rate}%（${r.satisfied}人）`)}
          </dl>
          <div class="result__manager"><span class="result__face">店長</span><p>${r.gameOver ? '…所持金がなくなってしまった。残念だけど、お店は閉店だ。' : r.comment}</p></div>
          ${r.gameOver
            ? '<p class="result__over">閉店（ゲームオーバー）</p><button type="button" class="btn btn--primary btn--big" data-action="restart">最初からやり直す</button>'
            : `<button type="button" class="btn btn--primary btn--big" data-action="next">翌日へ（${r.day + 1}日目）</button><p class="result__note">「翌日へ」でセーブされます</p>`}
        </div>`;
      el.hidden = false;
    },
    hide() {
      el.hidden = true;
    },
  };
}
