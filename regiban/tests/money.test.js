import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcChange, minCoins, judge, JUDGE, formatYen, CHANGE_DENOMINATIONS } from '../src/money.js';
import { createRng, mulberry32 } from '../src/rng.js';

test('calcChange: 基本・0円・大きなお釣り', () => {
  assert.equal(calcChange(520, 1000), 480);
  assert.equal(calcChange(520, 1020), 500);
  assert.equal(calcChange(700, 700), 0);
  assert.equal(calcChange(10, 10000), 9990);
});

test('calcChange: 預かり不足や小数はエラー', () => {
  assert.throws(() => calcChange(500, 400), RangeError);
  assert.throws(() => calcChange(10.5, 100), RangeError);
  assert.throws(() => calcChange(-1, 100), RangeError);
});

test('minCoins: 0円は0枚', () => {
  assert.deepEqual(minCoins(0), { count: 0, breakdown: {} });
});

test('minCoins: 端数', () => {
  assert.deepEqual(minCoins(6), { count: 2, breakdown: { 5: 1, 1: 1 } });
  assert.deepEqual(minCoins(483), {
    count: 11,
    breakdown: { 100: 4, 50: 1, 10: 3, 1: 3 },
  });
});

test('minCoins: 大きなお釣り（1万円札で10円の買い物）', () => {
  assert.deepEqual(minCoins(9990), {
    count: 15,
    breakdown: { 5000: 1, 1000: 4, 500: 1, 100: 4, 50: 1, 10: 4 },
  });
});

test('minCoins: 金種で表せない額はエラー', () => {
  assert.throws(() => minCoins(3, [5, 10]), RangeError);
});

test('judge: 最小枚数ならパーフェクト', () => {
  assert.equal(judge([100, 100, 100, 100, 50, 10, 10, 10], 480).result, JUDGE.PERFECT);
});

test('judge: 金額は合っているが枚数が多いと正解', () => {
  const r = judge([100, 100, 100, 100, 10, 10, 10, 10, 10, 10, 10, 10], 480);
  assert.equal(r.result, JUDGE.CORRECT);
  assert.equal(r.count, 12);
  assert.equal(r.minCount, 8);
});

test('judge: お釣り0円は何も置かなければパーフェクト', () => {
  assert.equal(judge([], 0).result, JUDGE.PERFECT);
  assert.equal(judge([1], 0).result, JUDGE.WRONG);
});

test('judge: 金額違いは不正解', () => {
  assert.equal(judge([100, 100, 100, 100, 50], 480).result, JUDGE.WRONG);
  assert.equal(judge([500], 480).result, JUDGE.WRONG);
  assert.equal(judge([], 10).result, JUDGE.WRONG);
});

test('judge: 大きなお釣り', () => {
  const tray = [5000, 1000, 1000, 1000, 1000, 500, 100, 100, 100, 100, 50, 10, 10, 10, 10];
  assert.equal(judge(tray, 9990).result, JUDGE.PERFECT);
});

test('CHANGE_DENOMINATIONS に1万円札は含まれない', () => {
  assert.ok(!CHANGE_DENOMINATIONS.includes(10000));
});

test('formatYen: 3桁区切り', () => {
  assert.equal(formatYen(0), '0円');
  assert.equal(formatYen(9990), '9,990円');
  assert.equal(formatYen(10000), '10,000円');
});

test('rng: 同じシードなら同じ並び、違うシードなら違う並び', () => {
  const seq = (seed) => Array.from({ length: 5 }, mulberry32(seed));
  assert.deepEqual(seq(42), seq(42));
  assert.notDeepEqual(seq(42), seq(43));
  for (const v of seq(1)) assert.ok(v >= 0 && v < 1);
});

test('rng: int は範囲内、weighted は重み0を選ばない', () => {
  const rng = createRng(7);
  for (let i = 0; i < 1000; i++) {
    const n = rng.int(1, 4);
    assert.ok(n >= 1 && n <= 4 && Number.isInteger(n));
    assert.equal(rng.weighted(['a', 'b'], (x) => (x === 'a' ? 0 : 1)), 'b');
  }
});
