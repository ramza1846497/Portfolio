// 床の汚れ。時々発生し、残っていると店内の客の満足度が少しずつ下がる。

export const WIPES_TO_CLEAN = 3;
export const MAX_DIRT = 3;
export const DRAIN_PER_SEC = 0.6;

export function createCleaning() {
  return { dirt: [], nextId: 1, timer: 25 };
}

export function tickCleaning(cl, dt, rng, spots) {
  cl.timer -= dt;
  if (cl.timer > 0) return null;
  cl.timer = rng.int(30, 55);
  if (cl.dirt.length >= MAX_DIRT) return null;
  const free = spots.filter((s) => !cl.dirt.some((d) => Math.hypot(d.x - s.x, d.z - s.z) < 0.5));
  if (free.length === 0) return null;
  const spot = rng.pick(free);
  const d = { id: cl.nextId++, x: spot.x + (rng.next() - 0.5) * 0.4, z: spot.z + (rng.next() - 0.5) * 0.4, wipes: 0 };
  cl.dirt.push(d);
  return d;
}

// 1回拭く。消えたら true
export function wipe(cl, id) {
  const d = cl.dirt.find((x) => x.id === id);
  if (!d) return false;
  d.wipes += 1;
  if (d.wipes >= WIPES_TO_CLEAN) {
    cl.dirt = cl.dirt.filter((x) => x.id !== id);
    return true;
  }
  return false;
}

export function satisfactionDrain(cl, dt) {
  return cl.dirt.length * DRAIN_PER_SEC * dt;
}
