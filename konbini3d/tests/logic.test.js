import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcChange, minCoins, judge, JUDGE, formatYen, isRealisticPayment } from '../src/logic/money.js';
import { createRng, mulberry32 } from '../src/logic/rng.js';
import { CUSTOMER_TYPES } from '../src/data/customerTypes.js';
import { PRODUCTS, FRY_BATCH, SNACK_BY_ID } from '../src/data/products.js';
import { createInventory, addBox, restock, takeFromShelf, returnToShelf, tidyBoxes } from '../src/systems/inventory.js';
import { SHELF_CAPACITY, RACK_SLOTS, SOLIDS, PLAYER_OBSTACLES, PLAYER_RADIUS, CUSTOMER_RADIUS } from '../src/world/store.js';
import { resolveCircle, moveCircle, segmentHitsBox, box, pointInBox, inflate } from '../src/world/collision.js';
import { createStoreGraph, planPath, buildGraph } from '../src/world/waypoints.js';
import { WAYPOINTS } from '../src/world/store.js';
import { checkOrder, orderTotal, boxCost, mergeOrder } from '../src/systems/ordering.js';
import { createDayStats, recordSale, recordPurchase, recordDiscrepancy, recordVisitor, dayProfit, satisfiedRate } from '../src/systems/economy.js';
import * as hs from '../src/systems/hotsnack.js';
import * as reg from '../src/systems/register.js';
import { createCleaning, wipe, tickCleaning } from '../src/systems/cleaning.js';
import { formatClock, createClock, advanceClock, CLOSE_MIN } from '../src/systems/clock.js';
import { Game, newGameSave, START_MONEY } from '../src/game.js';
import { loadSave, writeSave } from '../src/save.js';

const trayFor = (amount) => Object.entries(minCoins(amount).breakdown).flatMap(([d, n]) => Array(n).fill(Number(d)));

// ---------- お金 ----------

test('calcChange: 基本・0円・大きなお釣り・預かり不足', () => {
  assert.equal(calcChange(520, 1020), 500);
  assert.equal(calcChange(700, 700), 0);
  assert.equal(calcChange(10, 10000), 9990);
  assert.throws(() => calcChange(500, 400), RangeError);
  assert.throws(() => calcChange(1.5, 10), RangeError);
});

test('minCoins: 0円・端数・大きなお釣り', () => {
  assert.deepEqual(minCoins(0), { count: 0, breakdown: {} });
  assert.deepEqual(minCoins(483), { count: 11, breakdown: { 100: 4, 50: 1, 10: 3, 1: 3 } });
  assert.equal(minCoins(9990).count, 15);
});

test('judge: パーフェクト・正解・不正解・0円', () => {
  assert.equal(judge([100, 100, 100, 100, 50, 10, 10, 10], 480).result, JUDGE.PERFECT);
  assert.equal(judge([100, 100, 100, 100, 10, 10, 10, 10, 10, 10, 10, 10], 480).result, JUDGE.CORRECT);
  assert.equal(judge([500], 480).result, JUDGE.WRONG);
  assert.equal(judge([], 0).result, JUDGE.PERFECT);
  assert.equal(judge([1], 0).result, JUDGE.WRONG);
  assert.equal(formatYen(30000), '30,000円');
});

test('rng: 同じシードで同じ並び', () => {
  const seq = (seed) => Array.from({ length: 5 }, mulberry32(seed));
  assert.deepEqual(seq(42), seq(42));
  assert.notDeepEqual(seq(42), seq(43));
});

test('客タイプの支払い：預かり≧合計、お釣りは1万円未満で組み立て可能', () => {
  for (const type of CUSTOMER_TYPES) {
    const rng = createRng(1);
    for (let total = 1; total < 3000; total += 37) {
      const { paid } = type.pay(total, rng);
      const change = calcChange(total, paid);
      assert.ok(change < 10000);
      minCoins(change);
    }
  }
  const sc = CUSTOMER_TYPES.find((t) => t.id === 'smallchange');
  assert.equal(sc.pay(520, createRng(1)).paid, 1020);
  const coins = CUSTOMER_TYPES.find((t) => t.id === 'coins').pay(437, createRng(2));
  assert.equal(coins.paid, 437);
  assert.ok(coins.given.filter((v) => v <= 10).length >= 10, coins.label);
});

test('支払い：現実ではありえない払い方をしない（490円に1490円など）', () => {
  assert.equal(isRealisticPayment(490, [1000, 100, 100, 100, 100, 50, 10, 10, 10, 10]), false);
  assert.equal(isRealisticPayment(490, [100, 100, 100, 100, 100, 100]), false); // 600円 → お釣りに100円玉
  assert.equal(isRealisticPayment(520, [1000, 10, 10]), true);
  assert.equal(isRealisticPayment(490, [1000]), true);
  assert.equal(isRealisticPayment(2000, [1000, 1000, 1000]), false);
  assert.equal(isRealisticPayment(500, [100]), false);
  for (const type of CUSTOMER_TYPES) {
    const rng = createRng(9);
    for (let total = 1; total < 6000; total++) {
      const p = type.pay(total, rng);
      assert.ok(isRealisticPayment(total, p.given), `${type.id}: ${total}円に${p.label}`);
    }
  }
  const sc = CUSTOMER_TYPES.find((t) => t.id === 'smallchange');
  for (let seed = 0; seed < 50; seed++) assert.notEqual(sc.pay(490, createRng(seed)).paid, 1490);
});

// ---------- 在庫 ----------

test('在庫：補充は1個ずつ、満杯・違う商品・空箱は置けない', () => {
  const inv = createInventory({ tea: SHELF_CAPACITY - 2, water: 0 });
  const b = addBox(inv, 'tea');
  assert.equal(restock(inv, b, 'water'), 'mismatch');
  assert.equal(restock(inv, b, 'tea'), 'ok');
  assert.equal(restock(inv, b, 'tea'), 'ok');
  assert.equal(restock(inv, b, 'tea'), 'full');
  assert.equal(b.count, 4);
  const w = addBox(inv, 'water', 1);
  assert.equal(restock(inv, w, 'water'), 'ok');
  assert.equal(restock(inv, w, 'water'), 'empty');
});

test('在庫：客が取ると減り、戻すと増える（満杯なら戻せない）', () => {
  const inv = createInventory({ tea: 1 });
  assert.equal(takeFromShelf(inv, 'tea'), true);
  assert.equal(takeFromShelf(inv, 'tea'), false);
  assert.equal(returnToShelf(inv, 'tea'), true);
  inv.shelves.tea = SHELF_CAPACITY;
  assert.equal(returnToShelf(inv, 'tea'), false);
});

test('在庫：バックヤードの置き場があふれない・片付けで空箱を捨てる', () => {
  const inv = createInventory({});
  for (let i = 0; i < RACK_SLOTS.length; i++) assert.ok(addBox(inv, 'tea'));
  assert.equal(addBox(inv, 'tea'), null);
  inv.boxes[0].count = 0;
  inv.boxes[1].where = 'floor';
  tidyBoxes(inv);
  assert.equal(inv.boxes.length, RACK_SLOTS.length - 1);
  assert.ok(inv.boxes.every((b) => b.where === 'rack'));
  assert.equal(new Set(inv.boxes.map((b) => b.slot)).size, inv.boxes.length);
});

// ---------- 発注・集計 ----------

test('発注：金額・所持金不足・置き場不足', () => {
  assert.equal(orderTotal({ tea: 2, water: 1 }), boxCost('tea') * 2 + boxCost('water'));
  assert.equal(checkOrder({ tea: 1 }, 100, 10).ok, false);
  assert.equal(checkOrder({ tea: 3 }, 100000, 2).ok, false);
  assert.equal(checkOrder({}, 100000, 2).ok, false);
  assert.equal(checkOrder({ tea: 1 }, 100000, 2).ok, true);
  assert.deepEqual(mergeOrder({ tea: 1 }, { tea: 2, water: 0, juice: 1 }), { tea: 3, juice: 1 });
});

test('集計：利益 = 売上 − 仕入れ − レジ差額、満足率', () => {
  const st = createDayStats(1000);
  recordSale(st, 5000);
  recordPurchase(st, 2000);
  recordDiscrepancy(st, 100);
  recordVisitor(st, 90);
  recordVisitor(st, 10);
  assert.equal(dayProfit(st), 2900);
  assert.equal(satisfiedRate(st), 50);
});

// ---------- ホットスナック・掃除・時計 ----------

test('フライヤー：15秒で揚がり、10秒放置で焦げる', () => {
  const f = hs.createFryer();
  hs.startFry(f, SNACK_BY_ID.karaage);
  assert.equal(hs.tickFryer(f, 14.9), null);
  assert.equal(hs.tickFryer(f, 0.2), 'done');
  assert.equal(hs.tickFryer(f, 9.9), null);
  assert.equal(hs.tickFryer(f, 0.2), 'burnt');
  assert.equal(hs.takeOut(f), null);
  assert.deepEqual(hs.discardBurnt(f), { snackId: 'karaage', count: FRY_BATCH });
  hs.startFry(f, SNACK_BY_ID.potato);
  hs.tickFryer(f, 16);
  assert.deepEqual(hs.takeOut(f), { snackId: 'potato', count: FRY_BATCH });
  assert.equal(f.state, 'idle');
});

test('ホットケース：上限・古い順に取る・90秒で廃棄', () => {
  const c = hs.createCase();
  assert.equal(hs.addToCase(c, 'karaage', 4), 4);
  hs.tickCase(c, 50);
  assert.equal(hs.addToCase(c, 'karaage', 6), hs.CASE_CAP_PER_SNACK - 4);
  assert.equal(hs.takeFromCase(c, 'karaage'), true);
  assert.equal(hs.takeFromCase(c, 'potato'), false);
  const expired = hs.tickCase(c, 41);
  assert.deepEqual(expired, [{ snackId: 'karaage', count: 3 }]);
  assert.equal(hs.caseCount(c, 'karaage'), hs.CASE_CAP_PER_SNACK - 4);
});

test('掃除：3回拭くと消える、上限まで発生する', () => {
  const cl = createCleaning();
  const rng = createRng(4);
  for (let i = 0; i < 20; i++) tickCleaning(cl, 60, rng, [{ x: 0, z: 0 }, { x: 2, z: 0 }, { x: 4, z: 0 }, { x: 6, z: 0 }]);
  assert.equal(cl.dirt.length, 3);
  const id = cl.dirt[0].id;
  assert.equal(wipe(cl, id), false);
  assert.equal(wipe(cl, id), false);
  assert.equal(wipe(cl, id), true);
  assert.equal(cl.dirt.length, 2);
});

test('時計：7:00から始まり、360秒で22:00', () => {
  const c = createClock();
  assert.equal(formatClock(c.minutes), '7:00');
  assert.equal(advanceClock(c, 180), false);
  assert.equal(formatClock(c.minutes), '14:30');
  assert.equal(advanceClock(c, 180), true);
  assert.equal(c.minutes, CLOSE_MIN);
});

// ---------- レジ ----------

test('レジ：スキャン → ホットスナック → 会計 → お釣り', () => {
  const customer = { id: 1, carrying: ['tea', 'onigiri_sake'], hotOrder: 'karaage' };
  const co = reg.startCheckout(customer);
  assert.equal(reg.readyToPay(co), false);
  reg.scanItem(co, 0);
  assert.equal(reg.scanItem(co, 0), false); // 二重スキャンしない
  reg.scanItem(co, 1);
  assert.equal(reg.readyToPay(co), false);
  reg.resolveHot(co, 0, true);
  assert.equal(co.total, 140 + 150 + 220);
  const type = { pay: () => ({ paid: 1000, label: '' }), payDelay: 1 };
  reg.beginPayment(co, type, createRng(1));
  assert.equal(reg.tickPayment(co, 0.5), false);
  assert.equal(reg.tickPayment(co, 0.6), true);
  assert.equal(co.change, 490);
  for (const v of trayFor(490)) reg.addMoney(co, v);
  const r = reg.settle(co);
  assert.deepEqual([r.ok, r.perfect, r.diff], [true, true, 0]);
});

test('レジ：お釣りを間違えると差額が出る、品切れのホットスナックは加算しない', () => {
  const co = reg.startCheckout({ id: 1, carrying: ['water'], hotOrder: 'potato' });
  reg.scanItem(co, 0);
  reg.resolveHot(co, 0, false);
  assert.equal(co.total, 110);
  reg.beginPayment(co, { pay: () => ({ paid: 1000, label: '' }), payDelay: 0 }, createRng(1));
  reg.tickPayment(co, 0);
  reg.addMoney(co, 1000);
  const r = reg.settle(co);
  assert.equal(r.ok, false);
  assert.equal(r.diff, 110);
});

// ---------- 店内の当たり判定と経路 ----------

test('当たり判定：壁の向こうへすり抜けない', () => {
  const wall = box(0, 0.1, -5, 5);
  const pos = { x: -1, z: 0 };
  moveCircle(pos, 3, 0, 0.3, [wall]);
  assert.ok(pos.x <= -0.3 + 1e-9);
  const inside = { x: 0.05, z: 0 };
  resolveCircle(inside, 0.3, [wall]);
  assert.ok(!pointInBox(inside.x, inside.z, inflate(wall, 0.29)));
  assert.equal(segmentHitsBox(-1, 0, 1, 0, wall), true);
  assert.equal(segmentHitsBox(-1, 6, 1, 6, wall), false);
});

test('当たり判定：店内のどこからでも、売り場・レジ裏・バックヤードへ歩ける（引っかからない）', () => {
  // プレイヤー用に、バックヤードとレジ裏の経由点を足したグラフで歩かせる
  const extra = [
    { id: 'by1', x: 4.2, z: -3.6 }, { id: 'by2', x: -1.5, z: -3.55 }, { id: 'by3', x: -5.5, z: -3.55 },
    { id: 'byE', x: 5.5, z: -4.0 }, { id: 'st1', x: 1.7, z: 3.7 }, { id: 'st2', x: -3.0, z: 3.65 },
  ];
  const goals = [
    { id: 'gDoor', x: 4.5, z: 4.4 }, { id: 'gReg', x: -4.4, z: 3.6 }, { id: 'gBack', x: -5.0, z: -3.5 }, { id: 'gFryer', x: -1.1, z: 3.8 },
  ];
  const graph = buildGraph([...WAYPOINTS, ...extra, ...goals], PLAYER_OBSTACLES, PLAYER_RADIUS + 0.05);
  let starts = 0;
  for (let x = -5.6; x <= 5.6; x += 0.7) {
    for (let z = -4.6; z <= 4.6; z += 0.7) {
      if (PLAYER_OBSTACLES.some((b) => pointInBox(x, z, inflate(b, PLAYER_RADIUS)))) continue;
      starts += 1;
      for (const g of goals) {
        const p = { x, z };
        for (const w of planPath(graph, x, z, g.id)) {
          for (let i = 0; i < 600 && Math.hypot(w.x - p.x, w.z - p.z) > 0.1; i++) {
            const d = Math.hypot(w.x - p.x, w.z - p.z);
            const step = Math.min(0.05, d);
            moveCircle(p, ((w.x - p.x) / d) * step, ((w.z - p.z) / d) * step, PLAYER_RADIUS, PLAYER_OBSTACLES);
          }
        }
        assert.ok(Math.hypot(g.x - p.x, g.z - p.z) < 0.2, `(${x.toFixed(1)},${z.toFixed(1)}) → ${g.id} stuck at (${p.x.toFixed(2)},${p.z.toFixed(2)})`);
      }
    }
  }
  assert.ok(starts > 100);
});

test('経路：すべての経由点が出口とつながっている', () => {
  const graph = createStoreGraph();
  for (const w of WAYPOINTS) {
    const path = planPath(graph, w.x, w.z, 'out');
    assert.equal(path.at(-1).id, 'out', w.id);
  }
});

// ---------- 1日の通しシミュレーション ----------

// レジだけ担当するボット。並んだ客を順に会計する
function cashierBot(game) {
  const s = game.state;
  for (const id of Object.keys(s.inventory.shelves)) s.inventory.shelves[id] = SHELF_CAPACITY;
  s.cleaning.dirt = [];
  if (!s.checkout && !game.openRegister()) return;
  const co = s.checkout;
  if (co.phase === 'scan') {
    co.items.forEach((_, i) => game.regScan(i));
    co.hot.forEach((_, i) => game.regHot(i));
    game.regPay();
  } else if (co.phase === 'change') {
    for (const v of trayFor(co.change)) game.regAddMoney(v);
    game.regGive();
  }
}

function runDay(game, dt = 0.05, bot = cashierBot) {
  const s = game.state;
  const seen = new Map();
  let t = 0;
  game.openStore();
  while (s.phase === 'open' || s.phase === 'closing') {
    game.update(dt);
    bot(game);
    t += dt;
    for (const c of s.customers) {
      // 壁・棚の中に入らない
      for (const b of SOLIDS) assert.ok(!pointInBox(c.x, c.z, inflate(b, -0.01)), `customer ${c.id} inside ${b.id}`);
      // 歩くべき状態なのに進まない時間を測る
      const info = seen.get(c.id) ?? { walked: c.walked, still: 0, born: t };
      if (['toShelf', 'toQueue', 'leaving'].includes(c.state) && c.walked - info.walked < 0.01) info.still += dt;
      else info.still = 0;
      assert.ok(info.still < 4, `customer ${c.id} (${c.state}) stuck at ${c.x.toFixed(2)},${c.z.toFixed(2)}`);
      info.walked = c.walked;
      // 押し合って行ったり来たりしているだけでも見つけられるよう、同じ目的地へ歩く時間の上限も見る
      const leg = `${c.state}>${c.targetId}`;
      if (info.leg !== leg) Object.assign(info, { leg, legTime: 0 });
      if (['toShelf', 'toQueue', 'leaving'].includes(c.state)) info.legTime += dt;
      assert.ok(info.legTime < 25, `customer ${c.id} (${leg}) did not arrive in 25s, at ${c.x.toFixed(2)},${c.z.toFixed(2)}`);
      seen.set(c.id, info);
    }
    // 列の並び：状態の queue と各客の queueIndex が一致し、同じ場所に2人並ばない
    s.queue.forEach((id, i) => assert.equal(s.customers.find((c) => c.id === id).queueIndex, i));
    assert.equal(new Set(s.queue).size, s.queue.length);
    assert.ok(t < 900, 'day did not end');
  }
  return t;
}

test('1日の通し：客が来て買い物し、会計され、22時以降に全員帰って1日が終わる', () => {
  const game = new Game({ seed: 77 });
  const startMoney = game.state.money;
  runDay(game);
  const r = game.state.result;
  assert.equal(game.state.phase, 'result');
  assert.ok(r.visitors >= 20, `visitors ${r.visitors}`);
  assert.ok(r.sales > 0);
  assert.equal(r.discrepancy, 0);
  assert.equal(game.state.money - startMoney, r.profit);
  assert.ok(r.rate >= 80, `rate ${r.rate}`);
});

test('1日の通し：会計がゆっくりでも列が詰まらない（いろいろなシード）', () => {
  // 先頭に着いてから10秒かけて会計する店員。列が長くなり、帰る客と並ぶ客が行き交う
  for (let seed = 200; seed < 215; seed++) {
    const game = new Game({ seed });
    let wait = 0;
    runDay(game, 1 / 30, (g) => {
      const s = g.state;
      if (seed % 2) for (const id of Object.keys(s.inventory.shelves)) s.inventory.shelves[id] = SHELF_CAPACITY;
      if (!g.openRegister()) return;
      wait += 1 / 30;
      const co = s.checkout;
      if (co.phase === 'scan' && wait > 10) {
        co.items.forEach((_, i) => g.regScan(i));
        co.hot.forEach((_, i) => g.regHot(i));
        g.regPay();
      } else if (co.phase === 'change') {
        for (const v of trayFor(co.change)) g.regAddMoney(v);
        g.regGive();
        wait = 0;
      }
    });
    assert.equal(game.state.phase, 'result');
    assert.ok(game.state.result.sales > 0);
  }
});

test('1日の通し：レジを放置すると客は待ちきれずに帰り、商品は棚に戻る', () => {
  const game = new Game({ seed: 3 });
  const before = Object.values(game.state.inventory.shelves).reduce((a, b) => a + b, 0);
  runDay(game, 0.05, () => {});
  const after = Object.values(game.state.inventory.shelves).reduce((a, b) => a + b, 0);
  assert.equal(game.state.result.sales, 0);
  assert.equal(after, before);
  assert.ok(game.state.result.rate < 20);
});

test('5種類の客がすべて出現する', () => {
  const game = new Game({ seed: 12 });
  const seen = new Set();
  game.openStore();
  while (game.state.phase === 'open') {
    game.update(0.1);
    cashierBot(game);
    for (const c of game.state.customers) seen.add(c.typeId);
  }
  assert.equal(seen.size, CUSTOMER_TYPES.length);
});

test('「あ、これも」客は会計の直前に一度だけホットスナックを追加する', () => {
  const add = CUSTOMER_TYPES.find((t) => t.id === 'add');
  const game = new Game({ seed: 5, types: [add] });
  game.openStore();
  while (!game.openRegister()) game.update(0.1);
  const co = game.state.checkout;
  co.items.forEach((_, i) => game.regScan(i));
  assert.equal(co.hot.length, 0);
  assert.equal(game.regPay(), 'added');
  assert.equal(co.hot.length, 1);
  assert.equal(game.regPay(), 'notReady');
  game.regHot(0); // ケースは空なので品切れ
  assert.equal(game.regPay(), 'paying');
});

test('急いでる客は棚が空だとすぐ帰る', () => {
  const hurry = CUSTOMER_TYPES.find((t) => t.id === 'hurry');
  const save = newGameSave();
  for (const id of Object.keys(save.shelves)) save.shelves[id] = 0;
  const game = new Game({ seed: 8, types: [hurry], save });
  game.openStore();
  for (let i = 0; i < 400; i++) game.update(0.1);
  assert.equal(game.state.queue.length, 0);
  assert.ok(game.state.stats.visitors > 0);
  assert.equal(game.state.stats.satisfied, 0);
});

test('品出し：段ボールを持って棚に補充、満杯で止まり、空箱を片付ける', () => {
  const save = newGameSave();
  const game = new Game({ seed: 1, save });
  const s = game.state;
  const boxId = s.inventory.boxes.find((b) => b.productId === 'tea').id;
  assert.equal(game.describe({ type: 'shelf', id: 'tea' }).ok, false);
  game.use({ type: 'box', id: boxId });
  assert.equal(s.hand.kind, 'box');
  assert.equal(game.describe({ type: 'shelf', id: 'water' }).action, 'ここには置けません');
  s.inventory.shelves.tea = 8;
  for (let i = 0; i < 6; i++) game.use({ type: 'shelf', id: 'tea' });
  assert.equal(s.inventory.shelves.tea, 12);
  assert.equal(game.heldBox().count, 2);
  assert.equal(game.describe({ type: 'shelf', id: 'tea' }).action, '満杯です');
  game.use({ type: 'box', id: s.inventory.boxes.find((b) => b.productId === 'water').id }); // 手がふさがっている
  assert.equal(s.hand.boxId, boxId);
  s.inventory.shelves.tea = 0;
  for (let i = 0; i < 2; i++) game.use({ type: 'shelf', id: 'tea' });
  assert.equal(game.heldBox().count, 0);
  game.use(null); // 空箱を片付ける
  assert.equal(s.hand, null);
  assert.equal(s.inventory.boxes.filter((b) => b.productId === 'tea').length, 1);
});

test('3日間続けて遊べ、セーブから翌日を再開できる（発注は翌日入荷）', () => {
  let save = newGameSave();
  for (let day = 1; day <= 3; day++) {
    const game = new Game({ seed: 100 + day, save });
    assert.equal(game.state.day, day);
    const before = game.state.money;
    game.placeOrder({ tea: 1, onigiri_sake: 2 });
    assert.equal(game.state.money, before - (boxCost('tea') + boxCost('onigiri_sake') * 2));
    runDay(game);
    assert.equal(game.state.phase, 'result');
    save = JSON.parse(JSON.stringify(game.nextDaySave()));
    const next = new Game({ seed: 1, save });
    assert.equal(next.state.arrived, 3);
  }
  assert.equal(save.day, 4);
});

test('save: localStorage が無い環境でも落ちない', () => {
  assert.equal(loadSave(), null);
  assert.equal(writeSave(newGameSave()), false);
  assert.equal(START_MONEY, 30000);
});
