import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game, SHIFT_MS, scoreForSuccess } from '../src/game.js';
import { CUSTOMER_TYPES, createCustomer, addItemTo, difficultyAt } from '../src/customers.js';
import { calcChange, minCoins, JUDGE, isRealisticPayment } from '../src/money.js';
import { createRng } from '../src/rng.js';
import { loadHighScore, saveHighScore } from '../src/storage.js';

function trayFor(amount) {
  const { breakdown } = minCoins(amount);
  return Object.entries(breakdown).flatMap(([d, n]) => Array(n).fill(Number(d)));
}

// strategy(game) を毎ステップ呼びながら1シフト回す
function playShift(seed, strategy) {
  const events = [];
  const game = new Game({ seed, onEvent: (type, payload) => events.push({ type, payload }) });
  let now = 0;
  game.start(now);
  while (game.state.phase === 'playing') {
    now += 100;
    game.update(now);
    if (game.state.phase === 'playing') strategy(game);
  }
  return { game, events };
}

test('scoreForSuccess: 正解・パーフェクト・スピード・連続正解', () => {
  assert.equal(scoreForSuccess(JUDGE.CORRECT, 0, 0), 100);
  assert.equal(scoreForSuccess(JUDGE.PERFECT, 0, 0), 150);
  assert.equal(scoreForSuccess(JUDGE.PERFECT, 5.9, 3), 150 + 50 + 60);
});

test('Game: 毎回パーフェクトで渡すと120秒でシフト終了し、集計が合う', () => {
  let waitedSince = null;
  const { game, events } = playShift(123, (g) => {
    const c = g.state.customer;
    if (c.status !== 'waiting' || c.addAt !== null) {
      waitedSince = null;
      return;
    }
    waitedSince ??= g.state.elapsedMs;
    if (g.state.elapsedMs - waitedSince >= 1000) {
      g.state.tray = trayFor(c.change);
      g.submit();
    }
  });
  const ends = events.filter((e) => e.type === 'end');
  assert.equal(ends.length, 1);
  assert.equal(game.state.elapsedMs, SHIFT_MS);
  const r = ends[0].payload;
  assert.ok(r.served > 5);
  assert.equal(r.miss, 0);
  assert.equal(r.correct, r.served);
  assert.equal(r.perfect, r.correct);
  const sum = events.filter((e) => e.type === 'result').reduce((s, e) => s + e.payload.points, 0);
  assert.equal(r.score, sum);
});

test('Game: 何もしないと時間切れミスが続き、スコアは0未満にならない', () => {
  const { game } = playShift(5, () => {});
  assert.ok(game.state.miss > 0);
  assert.equal(game.state.correct, 0);
  assert.equal(game.state.score, 0);
});

test('Game: 金額違いはミスで連続正解リセット', () => {
  const game = new Game({ seed: 9 });
  game.start(0);
  let now = 0;
  while (game.state.customer.status !== 'waiting') game.update((now += 100));
  game.state.tray = trayFor(game.state.customer.change);
  game.submit();
  assert.equal(game.state.combo, 1);
  while (game.state.customer.status !== 'waiting') game.update((now += 100));
  game.addMoney(1);
  game.addMoney(1);
  game.state.tray.push(...trayFor(game.state.customer.change));
  game.submit();
  assert.equal(game.state.combo, 0);
  assert.equal(game.state.miss, 1);
});

test('Game: トレイの追加・取り消し', () => {
  const game = new Game({ seed: 1 });
  game.start(0);
  game.addMoney(100);
  game.addMoney(10);
  game.addMoney(100);
  game.addMoney(10000); // 1万円札は置けない
  assert.deepEqual(game.state.tray, [100, 10, 100]);
  game.removeMoney(100);
  assert.deepEqual(game.state.tray, [100, 10]);
  game.clearTray();
  assert.deepEqual(game.state.tray, []);
});

test('customers: 全タイプの支払いが妥当（預かり≧合計、お釣りは1万円未満）', () => {
  for (const type of CUSTOMER_TYPES) {
    for (let seed = 0; seed < 300; seed++) {
      const rng = createRng(seed);
      const c = createCustomer(rng, seed % 2 ? 10 : 60, { typeId: type.id });
      assert.ok(Number.isInteger(c.payment.paid));
      const change = calcChange(c.total, c.payment.paid);
      assert.ok(change < 10000, `${type.id}: change ${change}`);
      minCoins(change);
      assert.ok(isRealisticPayment(c.total, c.payment.given), `${type.id}: ${c.total}円に${c.payment.label}`);
      if (type.addItem) {
        const next = addItemTo(c, rng);
        assert.ok(next.total > c.total);
        assert.ok(isRealisticPayment(next.total, next.payment.given), `add: ${next.total}円に${next.payment.label}`);
        assert.ok(calcChange(next.total, next.payment.paid) < 10000);
      }
    }
  }
});

test('customers: タイプごとの支払い方', () => {
  for (let seed = 0; seed < 200; seed++) {
    const at = (typeId) => createCustomer(createRng(seed), 60, { typeId });
    const big = at('bigbill');
    assert.equal(big.payment.paid, 10000);
    assert.ok(big.items.length <= 2);
    assert.match(at('coins').payment.label, /^(100円玉×\d+ ?)?(10円玉×\d+ ?)?(1円玉×\d+)?$/);
    assert.equal(at('coins').payment.paid, at('coins').total);
    const n = at('normal');
    assert.ok(n.payment.paid > n.total);
    const sc = at('smallchange');
    // 端数を足して払ったときは、千円札だけで払うよりお釣りの枚数が少ない
    if (sc.payment.given.some((v) => v < 1000)) {
      const plain = minCoins(Math.ceil(sc.total / 1000) * 1000 - sc.total).count;
      assert.ok(minCoins(sc.payment.paid - sc.total).count < plain, `${sc.total}円に${sc.payment.label}`);
    }
  }
  // 設計書の例：520円に1020円払い
  const sc = CUSTOMER_TYPES.find((t) => t.id === 'smallchange');
  assert.equal(sc.pay(520, createRng(1)).paid, 1020);
  // 490円に1490円のような払い方はしない
  for (let seed = 0; seed < 50; seed++) assert.notEqual(sc.pay(490, createRng(seed)).paid, 1490);
});

test('customers: 開始直後は「あ、これも」客が出ず、30秒以降は出る', () => {
  assert.equal(difficultyAt(29.9), 'early');
  assert.equal(difficultyAt(30), 'late');
  const rng = createRng(3);
  const early = new Set(Array.from({ length: 500 }, () => createCustomer(rng, 5).type.id));
  const late = new Set(Array.from({ length: 500 }, () => createCustomer(rng, 60).type.id));
  assert.ok(!early.has('add'));
  assert.equal(late.size, CUSTOMER_TYPES.length);
});

test('storage: localStorage が無くても落ちない', () => {
  assert.equal(loadHighScore(), 0);
  assert.equal(saveHighScore(100), false);
});

test('Game: 「あ、これも」客は商品を追加し、トレイを残したままお釣りだけ更新する', () => {
  const events = [];
  const game = new Game({ seed: 11, onEvent: (type, payload) => events.push({ type, payload }) });
  let now = 0;
  game.start(now);
  // 「あ、これも」客が来るまで正解し続ける
  while (game.state.phase === 'playing') {
    game.update((now += 100));
    const c = game.state.customer;
    if (c.status !== 'waiting') continue;
    if (c.type.id === 'add') break;
    game.state.tray = trayFor(c.change);
    game.submit();
  }
  const c = game.state.customer;
  assert.equal(c.type.id, 'add');
  const before = { items: c.items.length, total: c.total, paid: c.payment.paid };
  game.addMoney(100);
  game.addMoney(10);
  while (!events.some((e) => e.type === 'add')) game.update((now += 100));
  assert.deepEqual(game.state.tray, [100, 10]);
  assert.equal(c.items.length, before.items + 1);
  assert.ok(c.total > before.total && c.payment.paid > before.paid);
  assert.equal(c.change, c.payment.paid - c.total);
  game.state.tray = trayFor(c.change);
  game.submit();
  assert.equal(c.result.kind, 'success');
});
