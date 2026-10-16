// 客タイプの定義と生成。タイプごとの違いはここのデータで表現し、ゲーム側に分岐を書かない。

import { minCoins, formatYen } from './money.js';
import { pickProducts, sumPrices } from './products.js';

// 客が払うときに使う金種（1万円札あり）
const PAY_DENOMINATIONS = [10000, 5000, 1000, 500, 100, 50, 10, 5, 1];

// 開始30秒以降は難しくなる
export const LATE_AFTER_SEC = 30;
const ITEM_RANGE = { early: [1, 2], late: [1, 4] };
const DEFAULT_PAY_DELAY_MS = 600;

const ceilTo = (value, unit) => Math.ceil(value / unit) * unit;
// value より大きい unit の倍数
const aboveTo = (value, unit) => ceilTo(value + 1, unit);

function moneyName(value) {
  return value >= 1000 ? `${formatYen(value)}札` : `${value}円玉`;
}

export function describeMoney(amount) {
  const { breakdown } = minCoins(amount, PAY_DENOMINATIONS);
  return Object.keys(breakdown)
    .map(Number)
    .sort((a, b) => b - a)
    .map((d) => `${moneyName(d)}×${breakdown[d]}`)
    .join(' ');
}

// 合計より大きい切りのいい額で払う
function payRound(total, rng) {
  const options = [
    { unit: 1000, weight: 6 },
    { unit: 500, weight: 2 },
    { unit: 100, weight: 1 },
  ];
  if (total < 5000) options.push({ unit: 5000, weight: 1 });
  const { unit } = rng.weighted(options, (o) => o.weight);
  const paid = aboveTo(total, unit);
  return { paid, label: describeMoney(paid) };
}

// 端数を足して、お釣りが切りよくなるように払う（520円に1020円など）
function paySmallChange(total, rng) {
  const fractions = [total % 500, total % 100, total % 10].filter((r) => r > 0);
  if (fractions.length === 0) return payRound(total, rng);
  const fraction = rng.pick(fractions);
  const base = aboveTo(total, 1000);
  return {
    paid: base + fraction,
    label: `${describeMoney(base)} ＋ ${describeMoney(fraction)}`,
  };
}

// 10円玉と1円玉を大量に出す
function payCoins(total, rng) {
  const paid = total + rng.int(0, 25);
  const ones = (paid % 10) + 10 * rng.int(0, 1);
  const tens = (paid - ones) / 10;
  const parts = [];
  if (tens > 0) parts.push(`10円玉×${tens}`);
  if (ones > 0) parts.push(`1円玉×${ones}`);
  return { paid, label: parts.join(' ') };
}

function payBigBill() {
  return { paid: 10000, label: describeMoney(10000) };
}

// 「あ、これも」：追加した商品の分を100円単位で上乗せして払う
function payAddOn(previous, addedPrice) {
  const extra = ceilTo(addedPrice, 100);
  return {
    paid: previous.paid + extra,
    label: `${previous.label} ＋ ${describeMoney(extra)}`,
  };
}

export const CUSTOMER_TYPES = Object.freeze([
  {
    id: 'normal',
    emoji: '🧑',
    name: 'ふつうの客',
    patience: 8,
    weight: { early: 10, late: 4 },
    pay: payRound,
    lines: {
      enter: ['これお願いします', 'お会計いいですか？', 'これください'],
      success: ['どうもー', 'ありがとうございます'],
      fail: ['あれ、金額ちがいません？', 'ちょっと遅いなあ…'],
    },
  },
  {
    id: 'smallchange',
    emoji: '👩‍🦳',
    name: '細かいのある客',
    patience: 8,
    weight: { early: 2, late: 3 },
    pay: paySmallChange,
    lines: {
      enter: ['あ、細かいのあるわ', 'ちょっと待ってね、端数出すから', 'お釣りがきれいになるように…'],
      success: ['ほら、すっきりしたでしょ', 'ありがとねえ'],
      fail: ['せっかく細かいの出したのに…', 'あら、ちがうわよ'],
    },
  },
  {
    id: 'coins',
    emoji: '👴',
    name: '小銭ジャラジャラ客',
    patience: 10,
    weight: { early: 1, late: 3 },
    payDelayMs: 2000,
    pay: payCoins,
    lines: {
      enter: ['小銭が多くてのう…', '財布を軽くしたくてな'],
      paying: ['ひい、ふう、みい…', 'ジャラジャラジャラ…', 'えーと、10円が…'],
      success: ['財布が軽くなったわい', 'ありがとさん'],
      fail: ['数え直しかのう…', 'おや、ちがうぞ'],
    },
  },
  {
    id: 'hurry',
    emoji: '🏃',
    name: '急いでる客',
    patience: 4,
    weight: { early: 1, late: 3 },
    pay: payRound,
    lines: {
      enter: ['急いでるんで！', '電車出ちゃう！早く！', 'すみません急ぎで！'],
      success: ['助かった！', '間に合う！'],
      fail: ['もういいです！', 'うわ、遅刻だ…'],
    },
  },
  {
    id: 'add',
    emoji: '🙋',
    name: '「あ、これも」客',
    patience: 10,
    weight: { early: 0, late: 3 },
    pay: payRound,
    addItem: { delayMs: 1800, pay: payAddOn },
    lines: {
      enter: ['これでお願いします', 'お会計を…'],
      add: ['あ、これも！', 'すみません、やっぱりこれも', 'ついでにこれも！'],
      success: ['すみません、ありがとう', 'どうもどうも'],
      fail: ['あれ？計算ちがう？', 'すみません、もういいです…'],
    },
  },
  {
    id: 'bigbill',
    emoji: '🤵',
    name: '一万円札の客',
    patience: 8,
    weight: { early: 1, late: 2 },
    maxItems: 2,
    pay: payBigBill,
    lines: {
      enter: ['一万円札しかなくて…', '大きいのでごめんなさい', 'これで（一万円札）'],
      success: ['くずれて助かりました', 'ありがとうございます'],
      fail: ['お釣り足りないような…', 'あの、合ってます？'],
    },
  },
]);

export function difficultyAt(elapsedSec) {
  return elapsedSec >= LATE_AFTER_SEC ? 'late' : 'early';
}

export function payDelayOf(type) {
  return type.payDelayMs ?? DEFAULT_PAY_DELAY_MS;
}

// options.typeId でタイプを固定できる（テスト用）
export function createCustomer(rng, elapsedSec, options = {}) {
  const level = difficultyAt(elapsedSec);
  const type = options.typeId
    ? CUSTOMER_TYPES.find((t) => t.id === options.typeId)
    : rng.weighted(CUSTOMER_TYPES, (t) => t.weight[level]);
  const [min, max] = ITEM_RANGE[level];
  const count = Math.min(rng.int(min, max), type.maxItems ?? Infinity);
  const items = pickProducts(rng, count);
  const total = sumPrices(items);
  return { type, items, total, payment: type.pay(total, rng) };
}

// 商品を1点追加し、新しい items / total / payment を返す
export function addItemTo(customer, rng) {
  const [added] = pickProducts(rng, 1);
  const items = [...customer.items, added];
  return {
    added,
    items,
    total: sumPrices(items),
    payment: customer.type.addItem.pay(customer.payment, added.price, rng),
  };
}
