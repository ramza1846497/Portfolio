/**
 * XZ 平面上の AABB による当たり判定。
 * プレイヤーは正方形（半径 r）として扱い、X 軸・Z 軸の順に移動して押し戻す。
 */
export interface Box2 {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  /** 一時的に無効化できる（開いた扉など） */
  enabled?: boolean;
  tag?: string;
}

export class CollisionWorld {
  readonly boxes: Box2[] = [];

  add(minX: number, minZ: number, maxX: number, maxZ: number, tag?: string): Box2 {
    const box: Box2 = {
      minX: Math.min(minX, maxX),
      maxX: Math.max(minX, maxX),
      minZ: Math.min(minZ, maxZ),
      maxZ: Math.max(minZ, maxZ),
      enabled: true,
      tag,
    };
    this.boxes.push(box);
    return box;
  }

  setEnabled(tag: string, enabled: boolean): void {
    for (const b of this.boxes) if (b.tag === tag) b.enabled = enabled;
  }

  /** 線分 a→b が、半径 r だけ太らせた箱のどれかを横切るか（怪異の経路探索用） */
  segmentBlocked(ax: number, az: number, bx: number, bz: number, r = 0): boolean {
    const dx = bx - ax;
    const dz = bz - az;
    for (const b of this.boxes) {
      if (b.enabled === false) continue;
      // スラブ法
      let t0 = 0;
      let t1 = 1;
      const slabs: [number, number, number, number][] = [
        [ax, dx, b.minX - r, b.maxX + r],
        [az, dz, b.minZ - r, b.maxZ + r],
      ];
      let hit = true;
      for (const [o, d, lo, hi] of slabs) {
        if (Math.abs(d) < 1e-9) {
          if (o < lo || o > hi) hit = false;
          continue;
        }
        let ta = (lo - o) / d;
        let tb = (hi - o) / d;
        if (ta > tb) [ta, tb] = [tb, ta];
        t0 = Math.max(t0, ta);
        t1 = Math.min(t1, tb);
        if (t0 > t1) hit = false;
      }
      if (hit) return true;
    }
    return false;
  }

  /** 位置 pos（x, z）を (dx, dz) だけ動かし、衝突を解決した結果を書き戻す */
  move(pos: { x: number; z: number }, dx: number, dz: number, r: number): void {
    // 大きな移動でのすり抜けを防ぐため細かく刻む
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dz)) / (r * 0.5)));
    const sx = dx / steps;
    const sz = dz / steps;
    for (let i = 0; i < steps; i++) {
      pos.x += sx;
      this.resolveAxis(pos, r, 'x', sx);
      pos.z += sz;
      this.resolveAxis(pos, r, 'z', sz);
    }
  }

  private resolveAxis(pos: { x: number; z: number }, r: number, axis: 'x' | 'z', delta: number): void {
    for (const b of this.boxes) {
      if (b.enabled === false) continue;
      if (pos.x + r <= b.minX || pos.x - r >= b.maxX || pos.z + r <= b.minZ || pos.z - r >= b.maxZ) continue;
      if (axis === 'x') {
        if (delta > 0) pos.x = b.minX - r;
        else if (delta < 0) pos.x = b.maxX + r;
        else pos.x = pos.x < (b.minX + b.maxX) / 2 ? b.minX - r : b.maxX + r;
      } else {
        if (delta > 0) pos.z = b.minZ - r;
        else if (delta < 0) pos.z = b.maxZ + r;
        else pos.z = pos.z < (b.minZ + b.maxZ) / 2 ? b.minZ - r : b.maxZ + r;
      }
    }
  }
}
