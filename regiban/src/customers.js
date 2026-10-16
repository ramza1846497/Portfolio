// 客タイプの定義と生成。タイプごとの違いはここのデータで表現し、ゲーム側に分岐を書かない。

import { formatYen, isRealisticPayment, sumMoney, minCoins as breakdownOf } from './money.js';
import { pickProducts, sumPrices } from './products.js';

// 客が払うときに使う金種（1万円札あり）
const PAY_DENOMINATIONS = [10000, 5000, 1000, 500, 100, 50, 10, 5, 1];

function moneyName(value) {
  return value >= 1000 ? `${formatYen(value)}札` : `${value}円玉`;
}

// 出したお金の配列 → 「千円札×1 10円玉×2」のような表示
function describeGiven(given) {
  const counts = new Map();
  for (const v of given) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.keys()].sort((a, b) => b - a).map((v) => `${moneyName(v)}×${counts.get(v)}`).join(' ');
}

// 金額をできるだけ少ない枚数のお金にする
function asMoney(amount) {
  const { breakdown } = breakdownOf(amount, PAY_DENOMINATIONS);
  return Object.entries(breakdown).flatMap(([d, n]) => Array(n).fill(Number(d)));
}

export function describeMoney(amount) {
  return describeGiven(asMoney(amount));
}

function payment(given) {
  return { paid: sumMoney(given), given, label: describeGiven(given) };
}

// 候補のうち現実的なものから重み付きで選ぶ。どれも当てはまらなければ、合計以上の一番小さいお札（硬貨）1枚で払う
function choose(total, rng, candidates) {
  const ok = candidates.filter((c) => c.weight > 0 && isRealisticPayment(total, c.given));
  if (ok.length) return payment(rng.weighted(ok, (c) => c.weight).given);
  const single = [500, 1000, 5000, 10000].find((v) => v >= total);
  return payment([single]);
}

// 切りのいい額で払う：千円札（足りなければ枚数を増やす）、5千円札、500円玉、100円玉だけ など
function roundCandidates(total) {
  return [
    { given: Array(Math.ceil(total / 1000)).fill(1000), weight: 6 },
    { given: [5000], weight: total < 5000 ? 1 : 0 },
    { given: [500], weight: total <= 500 ? 2 : 0 },
    { given: Array(Math.ceil(total / 100)).fill(100), weight: total <= 400 ? 1 : 0 },
    { given: [10000], weight: total > 1000 ? 0.5 : 0.2 },
  ];
}

function payRound(total, rng) {
  return choose(total, rng, roundCandidates(total));
}

// 端数を足して、お釣りの枚数が減るように払う（520円に1020円 → お釣り500円玉1枚）
function paySmallChange(total, rng) {
  const bills = Array(Math.ceil(total / 1000)).fill(1000);
  const plain = breakdownOf(sumMoney(bills) - total).count;
  const candidates = [];
  for (const unit of [10, 50, 100, 500]) {
    const fraction = total % unit;
    if (fraction === 0) continue;
    const given = [...bills, ...asMoney(fraction)];
    // お釣りの枚数が実際に減り、現実的な払い方だけを候補にする
    if (breakdownOf(sumMoney(given) - total).count < plain && isRealisticPayment(total, given)) candidates.push({ given, weight: 1 });
  }
  return candidates.length ? choose(total, rng, candidates) : payRound(total, rng);
}

// 小銭ジャラジャラ：100円玉・10円玉・1円玉を数えながら、ちょうどの金額を出す
function payCoins(total, rng) {
  const given = [];
  let rest = total;
  const hundreds = Math.max(0, Math.floor(rest / 100) - rng.int(2, 5));
  for (let i = 0; i < hundreds; i++) given.push(100);
  rest -= hundreds * 100;
  const ones = (rest % 10) + (rest >= 10 && rng.next() < 0.5 ? 10 : 0);
  for (let i = 0; i < (rest - ones) / 10; i++) given.push(10);
  for (let i = 0; i < ones; i++) given.push(1);
  return payment(given);
}

function payBigBill() {
  return payment([10000]);
}

// 「あ、これも」：追加した商品の分を足して払う。足し方が不自然なら、払い直す
function payAddOn(previous, addedPrice, rng, newTotal) {
  const extras = [asMoney(Math.ceil(addedPrice / 100) * 100), [1000], [500]];
  const candidates = extras.map((extra) => ({ given: [...previous.given, ...extra], weight: 1 }));
  const ok = candidates.filter((c) => isRealisticPayment(newTotal, c.given));
  if (ok.length) {
    const given = rng.weighted(ok, (c) => c.weight).given;
    return { ...payment(given), label: `${previous.label} ＋ ${describeGiven(given.slice(previous.given.length))}` };
  }
  return payRound(newTotal, rng);
}

// 開始30秒以降は難しくなる
export const LATE_AFTER_SEC = 30;
const ITEM_RANGE = { early: [1, 2], late: [1, 4] };
const DEFAULT_PAY_DELAY_MS = 600;

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
    payment: customer.type.addItem.pay(customer.payment, added.price, rng, sumPrices(items)),
  };
}
