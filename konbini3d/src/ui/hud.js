// 画面に重ねる表示：日数・時計・所持金、照準とヒント、持っている物、お知らせ。

import { formatClock } from '../systems/clock.js';
import { formatYen } from '../logic/money.js';

const PHASE_LABEL = { prep: '開店前', open: '営業中', closing: '閉店作業', result: '営業終了', gameover: '閉店' };
const TOAST_SEC = 3.2;

function setText(el, text) {
  const v = String(text);
  if (el.textContent !== v) el.textContent = v;
}

export function createHud(root) {
  root.innerHTML = `
    <div class="hud__top">
      <div class="hud__chip"><span id="hud-day"></span>日目</div>
      <div class="hud__chip hud__chip--clock"><span id="hud-clock"></span><small id="hud-phase"></small></div>
      <div class="hud__chip hud__chip--money">所持金 <strong id="hud-money"></strong></div>
      <div class="hud__chip" id="hud-queue"></div>
    </div>
    <div class="hud__prep" id="hud-prep" hidden></div>
    <div class="hud__toasts" id="hud-toasts"></div>
    <div class="crosshair" id="crosshair"></div>
    <div class="hud__hint" id="hud-hint"><div class="hud__hint-title"></div><div class="hud__hint-action"></div></div>
    <div class="hud__pops" id="hud-pops"></div>
    <div class="hud__hand" id="hud-hand" hidden></div>
    <div class="hud__keys">WASD 移動　クリック 使う（長押しで連続補充）　Q 下ろす　Esc 一時停止</div>
  `;
  const $ = (id) => root.querySelector(`#${id}`);
  const els = {
    day: $('hud-day'), clock: $('hud-clock'), phase: $('hud-phase'), money: $('hud-money'), queue: $('hud-queue'),
    prep: $('hud-prep'), toasts: $('hud-toasts'), crosshair: $('crosshair'), hint: $('hud-hint'), pops: $('hud-pops'), hand: $('hud-hand'),
  };
  const hintTitle = els.hint.children[0];
  const hintAction = els.hint.children[1];
  const toasts = [];

  function update(game, info, dt) {
    const s = game.state;
    setText(els.day, s.day);
    setText(els.clock, formatClock(s.clock.minutes));
    setText(els.phase, PHASE_LABEL[s.phase]);
    setText(els.money, formatYen(s.money));
    setText(els.queue, s.queue.length ? `レジ待ち ${s.queue.length}人` : 'レジ待ち なし');
    els.queue.classList.toggle('is-alert', s.queue.length > 0);
    els.prep.hidden = s.phase !== 'prep';
    if (s.phase === 'prep') setText(els.prep, `開店前の準備時間 あと${Math.ceil(s.clock.prepLeft)}秒（時計は止まっています）　Enterキーですぐ開店`);

    els.hint.hidden = !info;
    els.crosshair.classList.toggle('is-active', Boolean(info?.ok));
    if (info) {
      setText(hintTitle, info.title);
      setText(hintAction, info.action);
      hintAction.classList.toggle('is-ng', !info.ok);
    }
    const hand = game.handLabel();
    els.hand.hidden = !hand;
    if (hand) setText(els.hand, `手に持っている物：${hand}　（Qで下ろす）`);

    for (const t of toasts) t.left -= dt;
    while (toasts.length && toasts[0].left <= 0) toasts.shift().el.remove();
  }

  function toast(text, tone = 'info') {
    const el = document.createElement('div');
    el.className = `toast toast--${tone}`;
    el.textContent = text;
    els.toasts.append(el);
    toasts.push({ el, left: TOAST_SEC });
    if (toasts.length > 4) toasts.shift().el.remove();
  }

  // 照準のそばにふわっと出る短い表示
  function pop(text, tone = 'good') {
    const el = document.createElement('div');
    el.className = `pop pop--${tone}`;
    el.textContent = text;
    els.pops.append(el);
    el.addEventListener('animationend', () => el.remove());
  }

  function setVisible(v) {
    root.hidden = !v;
  }

  return { update, toast, pop, setVisible };
}
