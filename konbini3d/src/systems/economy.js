// 1日の売上・仕入れ・廃棄・満足度の集計。所持金そのものは game.js が持つ。

export const SATISFIED_LINE = 60;

export function createDayStats(startMoney) {
  return {
    startMoney,
    sales: 0,
    purchases: 0,
    waste: 0,
    discrepancy: 0,
    visitors: 0,
    satisfied: 0,
  };
}

export function recordSale(stats, amount) {
  stats.sales += amount;
}

export function recordPurchase(stats, amount) {
  stats.purchases += amount;
}

// 廃棄は原価で記録する（仕入れ済みのお金なので利益からは二重に引かない）
export function recordWaste(stats, amount) {
  stats.waste += amount;
}

export function recordDiscrepancy(stats, amount) {
  stats.discrepancy += amount;
}

export function recordVisitor(stats, satisfaction) {
  stats.visitors += 1;
  if (satisfaction >= SATISFIED_LINE) stats.satisfied += 1;
}

export function dayProfit(stats) {
  return stats.sales - stats.purchases - stats.discrepancy;
}

export function satisfiedRate(stats) {
  return stats.visitors === 0 ? 0 : Math.round((stats.satisfied / stats.visitors) * 100);
}

const COMMENTS = [
  { test: (p, r) => p >= 8000 && r >= 80, lines: ['いやあ、言うことなし！きみに店を任せたい。', '常連さんが増えてるよ、すごいね。'] },
  { test: (p, r) => p >= 3000 && r >= 60, lines: ['いい1日だったね。明日もこの調子で。', 'お客さんの顔、明るかったよ。'] },
  { test: (p, r) => r < 40, lines: ['お客さん、ちょっと不満そうだったね…。棚とレジ、見てあげて。', 'レジ待ちが長かったかな。先に会計を回そう。'] },
  { test: (p) => p < 0, lines: ['今日は赤字か…。発注は売れる分だけにしよう。', '仕入れすぎ注意だよ。'] },
  { test: () => true, lines: ['まあまあだね。少しずつ慣れていこう。', 'おつかれさま。明日もよろしく。'] },
];

export function managerComment(stats, rng) {
  const profit = dayProfit(stats);
  const rate = satisfiedRate(stats);
  return rng.pick(COMMENTS.find((c) => c.test(profit, rate)).lines);
}
