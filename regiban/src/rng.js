// シード付き乱数（mulberry32）。同じシードなら同じ並びになる。

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createRng(seed) {
  const next = mulberry32(seed);
  return {
    next,
    // min以上max以下の整数
    int(min, max) {
      return min + Math.floor(next() * (max - min + 1));
    },
    pick(list) {
      return list[Math.floor(next() * list.length)];
    },
    // weightOf(item) の重みに比例して1つ選ぶ
    weighted(list, weightOf) {
      const total = list.reduce((sum, item) => sum + weightOf(item), 0);
      if (total <= 0) throw new RangeError('重みの合計が0です');
      let r = next() * total;
      for (const item of list) {
        r -= weightOf(item);
        if (r < 0) return item;
      }
      return list[list.length - 1];
    },
  };
}
