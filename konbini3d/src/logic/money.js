// 金額計算とお釣り判定。DOMに依存しない純粋関数のみ。金額はすべて整数（円）。

// お釣りに使える金種（1万円札は含めない）
export const CHANGE_DENOMINATIONS = Object.freeze([1, 5, 10, 50, 100, 500, 1000, 5000]);

export const JUDGE = Object.freeze({
  PERFECT: 'perfect',
  CORRECT: 'correct',
  WRONG: 'wrong',
});

function assertYen(value, name) {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${name} は0以上の整数（円）である必要があります: ${value}`);
  }
}

export function calcChange(total, paid) {
  assertYen(total, 'total');
  assertYen(paid, 'paid');
  if (paid < total) throw new RangeError(`預かり金が足りません: ${paid} < ${total}`);
  return paid - total;
}

export function sumMoney(items) {
  return items.reduce((sum, value) => sum + value, 0);
}

// 最小枚数と内訳 { count, breakdown: { 金種: 枚数 } }。日本円の金種なら貪欲法で最適。
export function minCoins(amount, denominations = CHANGE_DENOMINATIONS) {
  assertYen(amount, 'amount');
  const sorted = [...denominations].sort((a, b) => b - a);
  const breakdown = {};
  let rest = amount;
  let count = 0;
  for (const d of sorted) {
    const n = Math.floor(rest / d);
    if (n > 0) {
      breakdown[d] = n;
      rest -= n * d;
      count += n;
    }
  }
  if (rest !== 0) throw new RangeError(`${amount}円はこの金種では表せません`);
  return { count, breakdown };
}

export function judge(trayItems, changeAmount, denominations = CHANGE_DENOMINATIONS) {
  const given = sumMoney(trayItems);
  const { count: minCount } = minCoins(changeAmount, denominations);
  let result = JUDGE.WRONG;
  if (given === changeAmount) {
    result = trayItems.length === minCount ? JUDGE.PERFECT : JUDGE.CORRECT;
  }
  return { result, given, expected: changeAmount, count: trayItems.length, minCount };
}

export function formatYen(amount) {
  return `${String(amount).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}円`;
}

// 現実的な払い方か。お釣りに「客が出したのと同じ種類のお金」が入るなら、それは出さなくてよかったお金なので不自然とみなす
// （490円に1490円 → お釣り1000円に出した千円札が入る、など）。given は出したお金の配列
export function isRealisticPayment(total, given) {
  const paid = sumMoney(given);
  if (paid < total) return false;
  const { breakdown } = minCoins(paid - total, [10000, ...CHANGE_DENOMINATIONS]);
  return given.every((v) => !breakdown[v]);
}
