// 客タイプの定義。タイプごとの違いはここのデータ（数値・フラグ・支払い関数・セリフ）で表す。

import { minCoins, formatYen } from '../logic/money.js';

const PAY_DENOMINATIONS = [10000, 5000, 1000, 500, 100, 50, 10, 5, 1];
const ceilTo = (value, unit) => Math.ceil(value / unit) * unit;
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
  return { paid: base + fraction, label: `${describeMoney(base)} ＋ ${describeMoney(fraction)}` };
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
