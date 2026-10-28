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
  /** 動く物（敵の体）。向こうから重なってくることがあるので、静的な壁より先に押し出す */
  dynamic?: boolean;
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
      const px = pos.x;
      pos.x += sx;
      this.resolveAxis(pos, r, 'x', px);
      const pz = pos.z;
      pos.z += sz;
      this.resolveAxis(pos, r, 'z', pz);
    }
  }

  /**
   * 動いた軸で重なった箱から押し戻す。
   * 押し戻す向きは「動く前にどちら側にいたか」で決める（移動の向きでは決めない）。
   * 動く前から重なっていた箱（敵が向こうから重なってきた、など）は、いちばん浅い向きへ押し出す。
   * 移動の向きで決めると、壁に少し食い込んだだけで壁の端まで一気に押し出され、
   * 壁の向こうへ抜けてしまうことがあった。
   */
  private resolveAxis(pos: { x: number; z: number }, r: number, axis: 'x' | 'z', prev: number): void {
    // 敵の体を先に、壁をあとに（敵に押された先が壁の中でも、壁の手前に戻す）
    for (const pass of [true, false]) {
      for (const b of this.boxes) {
        if (b.enabled === false || !!b.dynamic !== pass) continue;
        if (pos.x + r <= b.minX || pos.x - r >= b.maxX || pos.z + r <= b.minZ || pos.z - r >= b.maxZ) continue;
        const lo = axis === 'x' ? b.minX : b.minZ;
        const hi = axis === 'x' ? b.maxX : b.maxZ;
        if (prev + r <= lo + 1e-6) {
          if (axis === 'x') pos.x = lo - r;
          else pos.z = lo - r;
        } else if (prev - r >= hi - 1e-6) {
          if (axis === 'x') pos.x = hi + r;
          else pos.z = hi + r;
        } else if (axis === 'z') {
          // 動く前から重なっていた：いちばん浅い向きへ
          const pushes: [number, number][] = [
            [b.minX - r - pos.x, 0],
            [b.maxX + r - pos.x, 0],
            [0, b.minZ - r - pos.z],
            [0, b.maxZ + r - pos.z],
          ];
          pushes.sort((p, q) => Math.abs(p[0] + p[1]) - Math.abs(q[0] + q[1]));
          pos.x += pushes[0][0];
          pos.z += pushes[0][1];
        }
        // x の段で動く前から重なっていた箱は、続く z の段でまとめて解決する
      }
    }
  }
}
