// ゲーム全体の状態と操作。各 systems をつなぐ。Three.js と DOM には依存しない。

import { createRng } from './logic/rng.js';
import { PRODUCTS, PRODUCT_BY_ID, HOTSNACKS, SNACK_BY_ID, FRY_BATCH, BOX_SIZE } from './data/products.js';
import { CUSTOMER_TYPES, TYPE_BY_ID } from './data/customerTypes.js';
import {
  SHELF_CAPACITY, RACK_SLOTS, DIRT_SPOTS, DOOR, MOP_STAND, PLAYER_SPAWN, SOLIDS, inStaffArea,
} from './world/store.js';
import { createStoreGraph } from './world/waypoints.js';
import { resolveCircle } from './world/collision.js';
import { createClock, tickPrep, advanceClock, spawnIntervalAt } from './systems/clock.js';
import {
  createInventory, addBox, findBox, removeBox, restock, shelfCount, tidyBoxes,
} from './systems/inventory.js';
import {
  createDayStats, recordSale, recordPurchase, recordWaste, recordDiscrepancy, recordVisitor,
  dayProfit, satisfiedRate, managerComment,
} from './systems/economy.js';
import { checkOrder, mergeOrder, orderBoxes } from './systems/ordering.js';
import { createCleaning, tickCleaning, wipe, satisfactionDrain, WIPES_TO_CLEAN } from './systems/cleaning.js';
import {
  createFryer, startFry, tickFryer, takeOut, discardBurnt, createCase, addToCase, caseCount,
  takeFromCase, tickCase, emptyCase,
} from './systems/hotsnack.js';
import * as register from './systems/register.js';
import {
  MAX_CUSTOMERS, PENALTY, spawnCustomer, updateCustomers, leave, leaveQueue, queueHead, customerById, sayLine,
} from './systems/customers.js';

export const SAVE_VERSION = 1;
export const START_MONEY = 30000;
const INITIAL_SHELF = 6;
const INITIAL_BOXES = 2;

export function newGameSave() {
  return {
    version: SAVE_VERSION,
    day: 1,
    money: START_MONEY,
    shelves: Object.fromEntries(PRODUCTS.map((p) => [p.id, INITIAL_SHELF])),
    boxes: PRODUCTS.flatMap((p) => Array.from({ length: INITIAL_BOXES }, () => ({ productId: p.id, count: BOX_SIZE }))),
    pending: {},
  };
}

export class Game {
  constructor({ save = newGameSave(), seed = Date.now(), onEvent = () => {}, types = CUSTOMER_TYPES } = {}) {
    this.seed = seed >>> 0;
    this.onEvent = onEvent;
    this.types = types;
    this.graph = createStoreGraph();
    this.loadDay(save);
  }

  emit(type, payload) {
    this.onEvent(type, payload);
  }

  toast(text, tone = 'info') {
    this.emit('toast', { text, tone });
  }

  // ---------- 1日の始まりと終わり ----------

  loadDay(save) {
    this.rng = createRng((this.seed + save.day * 7919) >>> 0);
    const inventory = createInventory(save.shelves, save.boxes);
    let arrived = 0;
    for (const [pid, n] of Object.entries(save.pending ?? {})) {
      for (let i = 0; i < n; i++) if (PRODUCT_BY_ID[pid] && addBox(inventory, pid)) arrived += 1;
    }
    this.state = {
      phase: 'prep',
      day: save.day,
      money: save.money,
      clock: createClock(),
      inventory,
      pending: {},
      hand: null,
      mop: { where: 'stand', x: MOP_STAND.x, z: MOP_STAND.z },
      customers: [],
      queue: [],
      nextCustomerId: 1,
      spawnTimer: 2,
      checkout: null,
      fryer: createFryer(),
      hotCase: createCase(),
      cleaning: createCleaning(),
      stats: createDayStats(save.money),
      door: 0,
      player: { x: PLAYER_SPAWN.x, z: PLAYER_SPAWN.z, fx: 0, fz: -1 },
      arrived,
      result: null,
    };
  }

  openStore() {
    const s = this.state;
    if (s.phase !== 'prep') return;
    s.phase = 'open';
    s.clock.prepLeft = 0;
    this.toast('開店しました！いらっしゃいませ', 'good');
  }

  endDay() {
    const s = this.state;
    for (const b of emptyCase(s.hotCase)) this.wasteSnack(b.snackId, b.count);
    if (s.fryer.state === 'frying' || s.fryer.state === 'done') this.wasteSnack(s.fryer.snackId, FRY_BATCH);
    s.fryer = createFryer();
    if (s.hand?.kind === 'fried') this.wasteSnack(s.hand.snackId, s.hand.count);
    if (s.hand?.kind === 'box') findBox(s.inventory, s.hand.boxId).where = 'floor';
    s.hand = null;
    tidyBoxes(s.inventory);
    s.mop = { where: 'stand', x: MOP_STAND.x, z: MOP_STAND.z };
    s.cleaning = createCleaning();
    s.checkout = null;
    const st = s.stats;
    s.result = {
      day: s.day,
      ...st,
      profit: dayProfit(st),
      rate: satisfiedRate(st),
      money: s.money,
      comment: managerComment(st, this.rng),
      gameOver: s.money < 0,
    };
    s.phase = s.result.gameOver ? 'gameover' : 'result';
    this.emit('dayEnd', s.result);
  }

  // 翌日の開始時点のセーブデータ（入荷前）
  nextDaySave() {
    const s = this.state;
    return {
      version: SAVE_VERSION,
      day: s.day + 1,
      money: s.money,
      shelves: { ...s.inventory.shelves },
      boxes: s.inventory.boxes.filter((b) => b.count > 0).map((b) => ({ productId: b.productId, count: b.count })),
      pending: { ...s.pending },
    };
  }

  // ---------- 毎フレーム ----------

  update(dt) {
    const s = this.state;
    if (s.phase === 'result' || s.phase === 'gameover') return;
    if (s.phase === 'prep') {
      if (tickPrep(s.clock, dt)) this.openStore();
    } else {
      if (s.phase === 'open') {
        if (advanceClock(s.clock, dt)) {
          s.phase = 'closing';
          this.toast('22:00 閉店です。残りのお客さんの会計を済ませましょう');
        } else {
          this.tickSpawn(dt);
          if (tickCleaning(s.cleaning, dt, this.rng, DIRT_SPOTS)) this.toast('床が汚れています！モップで拭きましょう', 'bad');
        }
      }
      updateCustomers(this, dt);
      const drain = satisfactionDrain(s.cleaning, dt);
      if (drain > 0) for (const c of s.customers) if (c.state !== 'leaving') c.satisfaction -= drain;
      if (s.checkout && register.tickPayment(s.checkout, dt)) this.emit('register', s.checkout);
      if (s.phase === 'closing' && s.customers.length === 0) {
        this.endDay();
        return;
      }
    }
    this.tickHotsnack(dt);
    this.tickDoor(dt);
  }

  tickSpawn(dt) {
    const s = this.state;
    s.spawnTimer -= dt;
    if (s.spawnTimer > 0) return;
    s.spawnTimer = spawnIntervalAt(s.clock.minutes) * (0.7 + this.rng.next() * 0.6);
    if (s.customers.length >= MAX_CUSTOMERS) return;
    spawnCustomer(this, this.rng.weighted(this.types, (t) => t.weight));
  }

  tickHotsnack(dt) {
    const s = this.state;
    const name = s.fryer.snackId ? SNACK_BY_ID[s.fryer.snackId].name : '';
    const ev = tickFryer(s.fryer, dt);
    if (ev === 'done') this.toast(`${name}が揚がりました！10秒以内に取り出して`, 'good');
    if (ev === 'burnt') {
      this.wasteSnack(s.fryer.snackId, FRY_BATCH);
      this.toast(`${name}が焦げてしまいました…（廃棄）`, 'bad');
    }
    for (const b of tickCase(s.hotCase, dt)) {
      this.wasteSnack(b.snackId, b.count);
      this.toast(`ケースの${SNACK_BY_ID[b.snackId].name}が時間切れで廃棄になりました`, 'bad');
    }
  }

  tickDoor(dt) {
    const s = this.state;
    const near = (x, z) => Math.hypot(x - DOOR.x, z - DOOR.z) < 2.0;
    const open = near(s.player.x, s.player.z) || s.customers.some((c) => near(c.x, c.z));
    s.door += ((open ? 1 : 0) - s.door) * Math.min(1, dt * 6);
  }

  // ---------- お金 ----------

  wasteProduct(productId) {
    recordWaste(this.state.stats, PRODUCT_BY_ID[productId].cost);
  }

  wasteSnack(snackId, count) {
    recordWaste(this.state.stats, SNACK_BY_ID[snackId].cost * count);
  }

  customerExited(c) {
    recordVisitor(this.state.stats, c.satisfaction);
  }

  // ---------- 調べる・使う ----------

  heldBox() {
    const h = this.state.hand;
    return h?.kind === 'box' ? findBox(this.state.inventory, h.boxId) : null;
  }

  handLabel() {
    const h = this.state.hand;
    if (!h) return '';
    if (h.kind === 'box') {
      const b = this.heldBox();
      return b.count > 0 ? `${PRODUCT_BY_ID[b.productId].name}の段ボール（残り${b.count}個）` : '空の段ボール';
    }
    if (h.kind === 'mop') return 'モップ';
    return `揚げたて${SNACK_BY_ID[h.snackId].name} ×${h.count}`;
  }

  // 照準の先の物の名前と、クリックでできること
  describe(target) {
    const s = this.state;
    const hand = s.hand;
    const box = this.heldBox();
    if (box && box.count === 0) return { title: '空の段ボール', action: 'クリックで片付ける', ok: true };
    if (!target) return null;
    const busy = '手がふさがっています';
    switch (target.type) {
      case 'box': {
        const b = findBox(s.inventory, target.id);
        if (!b) return null;
        const title = b.count > 0 ? `${PRODUCT_BY_ID[b.productId].name}の段ボール（${b.count}個）` : '空の段ボール';
        if (hand) return { title, action: busy, ok: false };
        return { title, action: b.count > 0 ? '持つ' : '片付ける', ok: true };
      }
      case 'shelf': {
        const p = PRODUCT_BY_ID[target.id];
        const n = shelfCount(s.inventory, p.id);
        const title = `${p.name}　${n}/${SHELF_CAPACITY}`;
        if (!box) return { title, action: hand ? '' : '段ボールを持ってくると補充できます', ok: false };
        if (box.productId !== p.id) return { title, action: 'ここには置けません', ok: false };
        if (n >= SHELF_CAPACITY) return { title, action: '満杯です', ok: false };
        return { title, action: '補充する', ok: true };
      }
      case 'register': {
        const title = 'レジ';
        if (!inStaffArea(s.player.x, s.player.z)) return { title, action: 'カウンターの内側から操作します', ok: false };
        if (s.checkout) return { title, action: '会計を続ける', ok: true };
        if (queueHead(s)) return { title, action: `会計する（列 ${s.queue.length}人）`, ok: true };
        if (s.queue.length) return { title, action: 'お客さんがレジに向かっています', ok: false };
        return { title, action: 'お客さんはいません', ok: false };
      }
      case 'fryer': {
        const f = s.fryer;
        const name = f.snackId ? SNACK_BY_ID[f.snackId].name : '';
        if (f.state === 'idle') return { title: 'フライヤー', action: hand ? busy : '揚げる', ok: !hand };
        if (f.state === 'frying') return { title: 'フライヤー', action: `${name}を揚げ中…あと${Math.ceil(f.fryTime - f.t)}秒`, ok: false };
        if (f.state === 'done') return { title: 'フライヤー', action: hand ? `${busy}（焦げちゃう！）` : `${name}を取り出す`, ok: !hand };
        return { title: 'フライヤー', action: `焦げた${name}を捨てる`, ok: true };
      }
      case 'hotcase': {
        const title = `ホットケース（${HOTSNACKS.map((h) => `${h.name}${caseCount(s.hotCase, h.id)}`).join(' ')}）`;
        if (hand?.kind === 'fried') return { title, action: 'ケースに並べる', ok: true };
        return { title, action: '揚げたものを並べる場所です', ok: false };
      }
      case 'dirt': {
        const d = s.cleaning.dirt.find((x) => x.id === target.id);
        if (!d) return null;
        if (hand?.kind === 'mop') return { title: '床の汚れ', action: `拭く（${d.wipes}/${WIPES_TO_CLEAN}）`, ok: true };
        return { title: '床の汚れ', action: 'モップが必要です（バックヤード）', ok: false };
      }
      case 'mop':
        return { title: 'モップ', action: hand ? busy : '持つ', ok: !hand };
      case 'terminal':
        return { title: '発注端末', action: '発注する', ok: true };
      default:
        return null;
    }
  }

  // クリック。パネルを開くときは { panel } を返す
  use(target) {
    const s = this.state;
    const box = this.heldBox();
    if (box && box.count === 0) {
      removeBox(s.inventory, box.id);
      s.hand = null;
      this.emit('dispose', {});
      return null;
    }
    const info = this.describe(target);
    if (!info || !info.ok) return null;
    switch (target.type) {
      case 'box': {
        const b = findBox(s.inventory, target.id);
        if (b.count === 0) {
          removeBox(s.inventory, b.id);
          this.emit('dispose', {});
        } else {
          b.where = 'hand';
          s.hand = { kind: 'box', boxId: b.id };
        }
        return null;
      }
      case 'shelf':
        if (restock(s.inventory, box, target.id) === 'ok') this.emit('restock', { productId: target.id });
        return null;
      case 'register':
        return { panel: 'register' };
      case 'fryer': {
        const f = s.fryer;
        if (f.state === 'idle') return { panel: 'fryer' };
        if (f.state === 'done') {
          const out = takeOut(f);
          s.hand = { kind: 'fried', snackId: out.snackId, count: out.count };
        } else if (f.state === 'burnt') {
          discardBurnt(f);
        }
        return null;
      }
      case 'hotcase': {
        const n = addToCase(s.hotCase, s.hand.snackId, s.hand.count);
        if (n === 0) {
          this.toast('ケースがいっぱいです');
          return null;
        }
        s.hand.count -= n;
        this.emit('hotcase', { snackId: s.hand.snackId, count: n });
        if (s.hand.count <= 0) s.hand = null;
        else this.toast(`ケースに入りきらない分が${s.hand.count}個あります`);
        return null;
      }
      case 'dirt':
        if (wipe(s.cleaning, target.id)) this.emit('cleaned', {});
        return null;
      case 'mop':
        s.mop.where = 'hand';
        s.hand = { kind: 'mop' };
        return null;
      case 'terminal':
        return { panel: 'order' };
      default:
        return null;
    }
  }

  // Q：持っている物を足元に下ろす
  drop() {
    const s = this.state;
    const h = s.hand;
    if (!h) return;
    if (h.kind === 'fried') {
      this.toast('揚げたものはホットケースに並べてください');
      return;
    }
    const p = s.player;
    const pos = { x: p.x + p.fx * 0.6, z: p.z + p.fz * 0.6 };
    resolveCircle(pos, 0.25, SOLIDS);
    if (h.kind === 'box') {
      const b = this.heldBox();
      if (b.count === 0) removeBox(s.inventory, b.id);
      else Object.assign(b, { where: 'floor', x: pos.x, z: pos.z });
    } else {
      Object.assign(s.mop, { where: 'floor', x: pos.x, z: pos.z });
    }
    s.hand = null;
  }

  // ---------- フライヤー ----------

  startFrying(snackId) {
    const s = this.state;
    const snack = SNACK_BY_ID[snackId];
    const cost = snack.cost * FRY_BATCH;
    if (s.fryer.state !== 'idle') return false;
    if (s.money < cost) {
      this.toast('所持金が足りません');
      return false;
    }
    s.money -= cost;
    recordPurchase(s.stats, cost);
    startFry(s.fryer, snack);
    this.toast(`${snack.name}を揚げはじめました（${snack.fryTime}秒）`);
    return true;
  }

  // ---------- 発注 ----------

  freeSlotsTomorrow() {
    const s = this.state;
    const used = s.inventory.boxes.filter((b) => b.count > 0).length;
    return RACK_SLOTS.length - used - orderBoxes(s.pending);
  }

  placeOrder(order) {
    const s = this.state;
    const check = checkOrder(order, s.money, this.freeSlotsTomorrow());
    if (!check.ok) return check;
    s.money -= check.total;
    recordPurchase(s.stats, check.total);
    s.pending = mergeOrder(s.pending, order);
    this.toast(`発注しました（${orderBoxes(order)}箱）。明日の開店前に届きます`, 'good');
    return check;
  }

  // ---------- レジ ----------

  checkoutCustomer() {
    const co = this.state.checkout;
    return co ? customerById(this.state, co.customerId) : null;
  }

  openRegister() {
    const s = this.state;
    if (s.checkout) return true;
    const head = queueHead(s);
    if (!head) return false;
    s.checkout = register.startCheckout(head);
    head.inCheckout = true;
    return true;
  }

  regScan(index) {
    return this.state.checkout && register.scanItem(this.state.checkout, index);
  }

  regHot(index) {
    const s = this.state;
    const co = s.checkout;
    const h = co?.hot[index];
    if (!h || h.status !== 'pending') return false;
    const taken = takeFromCase(s.hotCase, h.snackId);
    register.resolveHot(co, index, taken);
    if (!taken) {
      const c = this.checkoutCustomer();
      c.satisfaction -= PENALTY.hotSoldout;
      sayLine(this, c, 'soldout');
      this.toast(`${SNACK_BY_ID[h.snackId].name}は品切れでした`, 'bad');
    }
    return true;
  }

  // 「会計」。「あ、これも」客はここで一度だけ追加注文する
  regPay() {
    const co = this.state.checkout;
    if (!co || !register.readyToPay(co)) return 'notReady';
    const c = this.checkoutCustomer();
    if (c.type.addsHotsnackAtCheckout && !co.addChecked) {
      co.addChecked = true;
      register.addHotOrder(co, this.rng.pick(HOTSNACKS).id);
      sayLine(this, c, 'add');
      return 'added';
    }
    register.beginPayment(co, c.type, this.rng);
    sayLine(this, c, 'paying');
    return 'paying';
  }

  regAddMoney(value) {
    return this.state.checkout && register.addMoney(this.state.checkout, value);
  }

  regRemoveMoney(value) {
    return this.state.checkout && register.removeMoney(this.state.checkout, value);
  }

  regClearTray() {
    if (this.state.checkout) register.clearTray(this.state.checkout);
  }

  regGive() {
    const s = this.state;
    const co = s.checkout;
    const result = co && register.settle(co);
    if (!result) return null;
    const c = this.checkoutCustomer();
    s.money += result.total - result.diff;
    recordSale(s.stats, result.total);
    if (result.diff > 0) recordDiscrepancy(s.stats, result.diff);
    if (!result.ok) c.satisfaction -= PENALTY.wrongChange;
    sayLine(this, c, result.ok ? 'success' : 'fail');
    c.inCheckout = false;
    c.carrying = [];
    leaveQueue(this, c);
    leave(this, c);
    s.checkout = null;
    this.emit('sale', result);
    return result;
  }
}

export { TYPE_BY_ID };
