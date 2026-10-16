// レジの会計パネル。状態は game.state.checkout を読み、操作は game の reg* を呼ぶ。

import { PRODUCT_BY_ID, SNACK_BY_ID } from '../data/products.js';
import { formatYen, sumMoney } from '../logic/money.js';
import { caseCount } from '../systems/hotsnack.js';
import { queueHead } from '../systems/customers.js';
import { padHtml, trayHtml } from './moneyPad.js';

const color = (hex) => `#${hex.toString(16).padStart(6, '0')}`;

export function createRegisterPanel(el, { game, onClose, onSale }) {
  let lastKey = '';
  let banner = null;

  el.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn || btn.disabled) return;
    const g = game();
    const i = Number(btn.dataset.index);
    const v = Number(btn.dataset.value);
    banner = btn.dataset.action === 'close' ? banner : null;
    switch (btn.dataset.action) {
      case 'close': onClose(); return;
      case 'scan': g.regScan(i); break;
      case 'hot': g.regHot(i); break;
      case 'pay': g.regPay(); break;
      case 'money': g.regAddMoney(v); btn.classList.remove('is-pop'); void btn.offsetWidth; btn.classList.add('is-pop'); break;
      case 'unmoney': g.regRemoveMoney(v); break;
      case 'clear': g.regClearTray(); break;
      case 'give': {
        const r = g.regGive();
        if (r) {
          banner = r;
          onSale(r);
          g.openRegister();
        }
        break;
      }
      case 'next': g.openRegister(); break;
    }
    render(true);
  });

  function bannerHtml() {
    if (!banner) return '';
    return banner.ok
      ? `<div class="reg__banner is-ok">ありがとうございました！ ${banner.perfect ? 'パーフェクト！ ' : ''}売上 +${formatYen(banner.total)}</div>`
      : `<div class="reg__banner is-ng">お釣りが違いました…　差額 −${formatYen(banner.diff)}</div>`;
  }

  function idleHtml(s) {
    const waiting = queueHead(s);
    return `
      <div class="panel__head"><h2>レジ</h2><button type="button" class="panel__close" data-action="close">閉じる（Esc）</button></div>
      ${bannerHtml()}
      <p class="reg__idle">${s.queue.length ? 'お客さんがレジに向かっています…' : 'お待ちのお客さんはいません。'}</p>
      <div class="reg__actions"><button type="button" class="btn btn--primary" data-action="next" ${waiting ? '' : 'disabled'}>次のお客さま</button></div>`;
  }

  function render(force = false) {
    const g = game();
    const s = g.state;
    const co = s.checkout;
    const c = g.checkoutCustomer();
    const key = co
      ? `${co.customerId}|${co.phase}|${co.items.map((x) => +x.scanned).join('')}|${co.hot.map((h) => h.status).join(',')}|${co.tray.join(',')}|${Math.ceil(co.payTimer)}|${c?.line}|${co.hot.map((h) => caseCount(s.hotCase, h.snackId)).join(',')}`
      : `idle|${s.queue.length}|${Boolean(queueHead(s))}|${banner?.total}`;
    if (!force && key === lastKey) return;
    lastKey = key;
    if (!co) {
      el.innerHTML = `<div class="panel__box panel__box--small">${idleHtml(s)}</div>`;
      return;
    }
    const scanning = co.phase === 'scan';
    const paying = co.phase === 'paying';
    const ready = co.items.every((x) => x.scanned) && co.hot.every((h) => h.status !== 'pending');
    const items = co.items
      .map((x, i) => {
        const p = PRODUCT_BY_ID[x.productId];
        return `<li class="reg__item${x.scanned ? ' is-done' : ''}">
          <span class="reg__swatch" style="background:${color(p.color)}"></span>
          <span class="reg__name">${p.name}</span><span class="reg__price">${formatYen(p.price)}</span>
          ${x.scanned ? '<span class="reg__ok">✓</span>' : `<button type="button" class="btn btn--scan" data-action="scan" data-index="${i}">スキャン</button>`}
        </li>`;
      })
      .join('');
    const hots = co.hot
      .map((h, i) => {
        const sn = SNACK_BY_ID[h.snackId];
        const stock = caseCount(s.hotCase, h.snackId);
        const right =
          h.status === 'taken' ? '<span class="reg__ok">✓</span>'
          : h.status === 'soldout' ? '<span class="reg__ng">品切れ</span>'
          : `<button type="button" class="btn btn--scan" data-action="hot" data-index="${i}">${stock > 0 ? `ケースから取る（残り${stock}）` : '品切れを伝える'}</button>`;
        return `<li class="reg__item reg__item--hot${h.status !== 'pending' ? ' is-done' : ''}">
          <span class="reg__swatch" style="background:${color(sn.color)}"></span>
          <span class="reg__name">${sn.name}（ホットスナック）</span><span class="reg__price">${formatYen(sn.price)}</span>${right}</li>`;
      })
      .join('');
    const changeKnown = co.phase === 'change';
    el.innerHTML = `
      <div class="panel__box">
        <div class="panel__head">
          <h2>レジ <small>${c?.type.name ?? ''}</small></h2>
          <button type="button" class="panel__close" data-action="close">閉じる（Esc）</button>
        </div>
        ${bannerHtml()}
        <p class="reg__line">「${c?.line || 'お願いします'}」</p>
        <div class="reg__cols">
          <section class="reg__left">
            <h3>商品</h3>
            <ul class="reg__items">${items}${hots}</ul>
            <div class="reg__total">合計 <strong>${formatYen(co.total)}</strong></div>
            <button type="button" class="btn btn--primary btn--wide" data-action="pay" ${scanning && ready ? '' : 'disabled'}>${scanning ? '会計' : '会計済み'}</button>
          </section>
          <section class="reg__right">
            <div class="reg__lcd">
              <div><span>お預かり</span><strong>${paying ? '支払い中…' : co.payment ? formatYen(co.payment.paid) : '—'}</strong></div>
              <div class="reg__change"><span>お釣り</span><strong>${changeKnown ? formatYen(co.change) : '—'}</strong></div>
              <p>${co.payment && !paying ? `受け取り：${co.payment.label}` : paying ? `お客さんが支払っています…（${Math.ceil(co.payTimer)}秒）` : '全部スキャンしたら「会計」'}</p>
            </div>
            <div class="tray">
              <div class="tray__head"><span>お釣りトレイ <small>（タップで1枚戻す）</small></span><strong>${formatYen(sumMoney(co.tray))}</strong></div>
              <div class="tray__items">${trayHtml(co.tray)}</div>
            </div>
            <div class="pad">${padHtml(scanning)}</div>
            <div class="reg__actions">
              <button type="button" class="btn" data-action="clear" ${co.tray.length && !scanning ? '' : 'disabled'}>全部戻す</button>
              <button type="button" class="btn btn--primary" data-action="give" ${changeKnown ? '' : 'disabled'}>渡す</button>
            </div>
          </section>
        </div>
      </div>`;
  }

  return {
    show() {
      banner = null;
      el.hidden = false;
      render(true);
    },
    hide() {
      el.hidden = true;
    },
    update() {
      if (!el.hidden) render();
    },
  };
}
