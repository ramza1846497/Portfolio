// 客タイプの定義。タイプごとの違いはここのデータ（数値・フラグ・支払い関数・セリフ）で表す。

import { formatYen, isRealisticPayment, sumMoney, minCoins as breakdownOf } from '../logic/money.js';

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

// patience: レジ列で待てる秒数、payDelay: 支払いにかかる秒数
export const CUSTOMER_TYPES = Object.freeze([
  {
    id: 'normal',
    name: 'ふつうの客',
    color: 0x4f7cc4,
    weight: 5,
    patience: 45,
    speed: 1.2,
    wants: [1, 3],
    hotsnackChance: 0.3,
    payDelay: 0.8,
    leaveOnMissing: false,
    addsHotsnackAtCheckout: false,
    pay: payRound,
    lines: {
      enter: ['何買おうかな', 'お昼どうしよう'],
      missing: ['あれ、売り切れか…', 'ないのかあ'],
      queue: ['お願いします'],
      angry: ['もういいです…', '待ちくたびれた…'],
      success: ['どうもー', 'ありがとう'],
      fail: ['あれ、お釣りちがいません？'],
      soldout: ['じゃあ、いいです'],
    },
  },
  {
    id: 'smallchange',
    name: '細かいのある客',
    color: 0x9b6bc4,
    weight: 2,
    patience: 45,
    speed: 1.0,
    wants: [1, 3],
    hotsnackChance: 0.2,
    payDelay: 1.2,
    leaveOnMissing: false,
    addsHotsnackAtCheckout: false,
    pay: paySmallChange,
    lines: {
      enter: ['今日は何にしようかしら'],
      missing: ['あら、ないのね'],
      queue: ['細かいのあるわよ'],
      angry: ['ずいぶん待たせるのね…'],
      success: ['お釣りすっきりね', 'ありがとねえ'],
      fail: ['あら、ちがうわよ'],
      soldout: ['なら、いいわ'],
    },
  },
  {
    id: 'coins',
    name: '小銭ジャラジャラ客',
    color: 0x8a8a5a,
    weight: 1.5,
    patience: 70,
    speed: 0.9,
    wants: [1, 2],
    hotsnackChance: 0.2,
    payDelay: 3,
    leaveOnMissing: false,
    addsHotsnackAtCheckout: false,
    pay: payCoins,
    lines: {
      enter: ['小銭を使い切りたくてのう'],
      missing: ['おや、ないのか'],
      queue: ['小銭で払うぞい'],
      paying: ['ひい、ふう、みい…', 'ジャラジャラジャラ…'],
      angry: ['また来るわい…'],
      success: ['財布が軽くなったわい'],
      fail: ['数え直しかのう…'],
      soldout: ['そうか、残念じゃ'],
    },
  },
  {
    id: 'hurry',
    name: '急いでる客',
    color: 0xd9534f,
    weight: 2,
    patience: 18,
    speed: 1.8,
    wants: [1, 2],
    hotsnackChance: 0.1,
    payDelay: 0.5,
    leaveOnMissing: true,
    addsHotsnackAtCheckout: false,
    pay: payRound,
    lines: {
      enter: ['急いでるんだ！'],
      missing: ['ないの！？もういい！'],
      queue: ['早くお願いします！'],
      angry: ['間に合わない！'],
      success: ['助かった！'],
      fail: ['ちょっと、ちがう！'],
      soldout: ['じゃあいいです！'],
    },
  },
  {
    id: 'add',
    name: '「あ、これも」客',
    color: 0x3fa66b,
    weight: 1.5,
    patience: 70,
    speed: 1.1,
    wants: [1, 3],
    hotsnackChance: 0,
    payDelay: 0.8,
    leaveOnMissing: false,
    addsHotsnackAtCheckout: true,
    pay: payRound,
    lines: {
      enter: ['えーと…'],
      missing: ['あ、ないんだ'],
      queue: ['お願いしまーす'],
      add: ['あ、これも！ホットスナックも！', 'すみません、やっぱりあれも'],
      angry: ['すみません、また今度…'],
      success: ['すみません、ありがとう'],
      fail: ['あれ？計算ちがう？'],
      soldout: ['あ、ないならいいです'],
    },
  },
]);

export const TYPE_BY_ID = Object.freeze(Object.fromEntries(CUSTOMER_TYPES.map((t) => [t.id, t])));
