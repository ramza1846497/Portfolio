// 画面描画と入力。ゲームの状態は読むだけで、変更は handlers 経由で行う。

import { CHANGE_DENOMINATIONS, formatYen, sumMoney } from './money.js';

const $ = (id) => document.getElementById(id);

function setText(el, text) {
  const value = String(text);
  if (el.textContent !== value) el.textContent = value;
}

// クラスを付け直してCSSアニメーションを最初から再生する
function replay(el, className) {
  el.classList.remove(className);
  void el.offsetWidth;
  el.classList.add(className);
}

export function moneyToken(value) {
  const el = document.createElement('span');
  const kind = value >= 1000 ? 'bill' : 'coin';
  el.className = `money money--${kind} money--y${value}`;
  el.textContent = String(value);
  return el;
}

function buildPad(pad, onMoney) {
  for (const value of CHANGE_DENOMINATIONS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `pad__btn ${value >= 1000 ? 'pad__btn--bill' : ''}`;
    btn.dataset.value = String(value);
    btn.setAttribute('aria-label', `${value}円`);
    btn.append(moneyToken(value));
    const label = document.createElement('span');
    label.className = 'pad__label';
    label.textContent = `${value}円`;
    btn.append(label);
    pad.append(btn);
  }
  pad.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-value]');
    if (!btn || btn.disabled) return;
    replay(btn, 'is-pop');
    onMoney(Number(btn.dataset.value));
  });
}

function renderTray(container, tray, landed) {
  const counts = new Map();
  for (const v of tray) counts.set(v, (counts.get(v) ?? 0) + 1);
  const values = [...counts.keys()].sort((a, b) => b - a);
  const nodes = values.map((value) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `tray__stack${value === landed ? ' is-landed' : ''}`;
    btn.dataset.value = String(value);
    btn.setAttribute('aria-label', `${value}円を1枚戻す`);
    btn.append(moneyToken(value));
    const n = counts.get(value);
    if (n > 1) {
      const badge = document.createElement('span');
      badge.className = 'tray__count';
      badge.textContent = `×${n}`;
      btn.append(badge);
    }
    return btn;
  });
  if (nodes.length === 0) {
    const empty = document.createElement('span');
    empty.className = 'tray__empty';
    empty.textContent = 'ここにお釣りが並びます';
    nodes.push(empty);
  }
  container.replaceChildren(...nodes);
}

function renderItems(list, items) {
  list.replaceChildren(
    ...items.map((item) => {
      const li = document.createElement('li');
      li.className = 'items__item';
      li.innerHTML = `<span class="items__emoji"></span><span class="items__name"></span><span class="items__price"></span>`;
      li.children[0].textContent = item.emoji;
      li.children[1].textContent = item.name;
      li.children[2].textContent = formatYen(item.price);
      return li;
    }),
  );
}

export function createUI(handlers) {
  const screens = {
    title: $('screen-title'),
    game: $('screen-game'),
    result: $('screen-result'),
  };
  const els = {
    time: $('time'),
    timeBox: $('status-time'),
    score: $('score'),
    served: $('served'),
    customer: $('customer'),
    emoji: $('cust-emoji'),
    name: $('cust-name'),
    line: $('cust-line'),
    items: $('cust-items'),
    patience: $('patience-bar'),
    combo: $('combo'),
    popup: $('popup'),
    register: $('register'),
    total: $('reg-total'),
    paid: $('reg-paid'),
    change: $('reg-change'),
    note: $('reg-note'),
    traySum: $('tray-sum'),
    trayItems: $('tray-items'),
    pad: $('money-pad'),
    give: $('btn-give'),
    clear: $('btn-clear'),
  };
  let trayKey = null;
  let trayLength = 0;
  let itemsKey = null;

  buildPad(els.pad, handlers.onMoney);
  els.trayItems.addEventListener('click', (e) => {
    const stack = e.target.closest('[data-value]');
    if (stack) handlers.onRemove(Number(stack.dataset.value));
  });
  els.give.addEventListener('click', () => handlers.onGive());
  els.clear.addEventListener('click', () => handlers.onClear());
  $('btn-start').addEventListener('click', () => handlers.onStart());
  $('btn-retry').addEventListener('click', () => handlers.onStart());
  $('btn-title').addEventListener('click', () => handlers.onTitle());

  function showScreen(name) {
    for (const [key, el] of Object.entries(screens)) el.hidden = key !== name;
    window.scrollTo(0, 0);
    if (name === 'result') $('btn-retry').focus({ preventScroll: true });
  }

  function renderTitle(highScore) {
    setText($('title-high'), highScore);
  }

  function renderGame(state) {
    const c = state.customer;
    const sec = Math.ceil(state.timeLeftMs / 1000);
    setText(els.time, sec);
    els.timeBox.classList.toggle('is-urgent', sec <= 10);
    setText(els.score, state.score);
    setText(els.served, state.served);
    els.combo.hidden = state.combo < 2;
    setText(els.combo, `${state.combo}連続！`);
    if (!c) return;

    setText(els.emoji, c.type.emoji);
    setText(els.name, c.type.name);
    setText(els.line, c.line);
    const key = `${c.serial}:${c.items.length}`;
    if (key !== itemsKey) {
      itemsKey = key;
      renderItems(els.items, c.items);
    }

    const paying = c.status === 'paying';
    setText(els.total, formatYen(c.total));
    setText(els.paid, paying ? 'お支払い中…' : formatYen(c.payment.paid));
    setText(els.change, c.change === null ? '—' : formatYen(c.change));
    setText(els.note, paying ? '' : `受け取り：${c.payment.label}`);

    const ratio = c.patienceLeftMs / c.patienceMs;
    els.patience.style.transform = `scaleX(${ratio})`;
    els.patience.dataset.level = ratio > 0.5 ? 'ok' : ratio > 0.25 ? 'warn' : 'danger';

    const tk = `${c.serial}:${state.tray.join(',')}`;
    if (tk !== trayKey) {
      trayKey = tk;
      const landed = state.tray.length > trayLength ? state.tray.at(-1) : null;
      trayLength = state.tray.length;
      renderTray(els.trayItems, state.tray, landed);
      setText(els.traySum, formatYen(sumMoney(state.tray)));
    }

    const leaving = c.status === 'leaving';
    els.give.disabled = c.status !== 'waiting';
    els.clear.disabled = leaving || state.tray.length === 0;
    els.pad.classList.toggle('is-locked', leaving);
  }

  function showPopup(text, tone) {
    els.popup.textContent = text;
    els.popup.dataset.tone = tone;
    replay(els.popup, 'is-show');
  }

  function handleEvent(type, payload) {
    if (type === 'customer') {
      els.emoji.classList.remove('is-happy', 'is-angry');
      replay(els.customer, 'is-enter');
    } else if (type === 'paid') {
      replay(els.register, 'is-flash');
    } else if (type === 'add') {
      replay(els.register, 'is-flash');
      replay(els.line, 'is-pop');
      showPopup(`${payload.added.emoji} 追加！`, 'warn');
    } else if (type === 'result') {
      if (payload.kind === 'success') {
        replay(els.emoji, 'is-happy');
        showPopup(`${payload.perfect ? 'パーフェクト！' : '正解！'} +${payload.points}`, payload.perfect ? 'perfect' : 'ok');
      } else {
        replay(els.emoji, 'is-angry');
        replay(screens.game, 'is-shake');
        showPopup(payload.reason === 'timeout' ? '時間切れ… −50' : 'お釣りちがい… −50', 'danger');
      }
    }
  }

  function renderResult(r) {
    setText($('res-score'), r.score);
    $('res-new').hidden = !r.isNewHigh;
    setText($('res-high'), r.highScore);
    setText($('res-served'), `${r.served}人`);
    setText($('res-correct'), `${r.correct}人`);
    setText($('res-perfect'), `${r.perfect}回`);
    setText($('res-miss'), `${r.miss}回`);
    setText($('res-combo'), `${r.maxCombo}連続`);
    setText($('res-comment'), r.comment);
    trayKey = null;
    itemsKey = null;
  }

  return { showScreen, renderTitle, renderGame, handleEvent, renderResult };
}
