// 軸平行の箱（AABB）と円（プレイヤー・客の足元）の当たり判定。XZ平面だけを扱う。

export function box(minX, maxX, minZ, maxZ) {
  return { minX, maxX, minZ, maxZ };
}

export function inflate(b, pad) {
  return { minX: b.minX - pad, maxX: b.maxX + pad, minZ: b.minZ - pad, maxZ: b.maxZ + pad };
}

export function pointInBox(x, z, b) {
  return x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ;
}

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

// 円が箱にめり込んでいたら押し出す。pos を書き換え、当たったら true
export function resolveCircle(pos, radius, boxes) {
  let hit = false;
  for (let iter = 0; iter < 4; iter++) {
    let moved = false;
    for (const b of boxes) {
      const cx = clamp(pos.x, b.minX, b.maxX);
      const cz = clamp(pos.z, b.minZ, b.maxZ);
      const dx = pos.x - cx;
      const dz = pos.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= radius * radius) continue;
      if (d2 > 1e-12) {
        const d = Math.sqrt(d2);
        const push = radius - d;
        pos.x += (dx / d) * push;
        pos.z += (dz / d) * push;
      } else {
        // 中心が箱の中：いちばん浅い方向へ出す
        const left = pos.x - b.minX;
        const right = b.maxX - pos.x;
        const back = pos.z - b.minZ;
        const front = b.maxZ - pos.z;
        const m = Math.min(left, right, back, front);
        if (m === left) pos.x = b.minX - radius;
        else if (m === right) pos.x = b.maxX + radius;
        else if (m === back) pos.z = b.minZ - radius;
        else pos.z = b.maxZ + radius;
      }
      moved = true;
      hit = true;
    }
    if (!moved) break;
  }
  return hit;
}

// すり抜け防止のため細かく刻んで動かす
export function moveCircle(pos, dx, dz, radius, boxes) {
  const len = Math.hypot(dx, dz);
  const steps = Math.max(1, Math.ceil(len / (radius * 0.5)));
  for (let i = 0; i < steps; i++) {
    pos.x += dx / steps;
    pos.z += dz / steps;
    resolveCircle(pos, radius, boxes);
  }
}

// 線分 a→b が箱を横切るか（スラブ法）
export function segmentHitsBox(ax, az, bx, bz, b) {
  let t0 = 0;
  let t1 = 1;
  const dx = bx - ax;
  const dz = bz - az;
  const axes = [
    [dx, ax, b.minX, b.maxX],
    [dz, az, b.minZ, b.maxZ],
  ];
  for (const [d, a, lo, hi] of axes) {
    if (Math.abs(d) < 1e-12) {
      if (a <= lo || a >= hi) return false;
    } else {
      let ta = (lo - a) / d;
      let tb = (hi - a) / d;
      if (ta > tb) [ta, tb] = [tb, ta];
      t0 = Math.max(t0, ta);
      t1 = Math.min(t1, tb);
      if (t0 >= t1) return false;
    }
  }
  return true;
}

export function segmentClear(ax, az, bx, bz, boxes) {
  for (const b of boxes) if (segmentHitsBox(ax, az, bx, bz, b)) return false;
  return true;
}
