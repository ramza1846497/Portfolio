import * as THREE from 'three';

/*
 * 関節つきの敵を動かす仕組み。
 * 姿勢（関節ごとの回転の目標）を敵の状態から毎フレーム決め、各関節はその目標へなめらかに近づく。
 * 急に切り替わらないので、カクカクせず、ぬるりと動く。
 */

/** 関節の目標：基準の向きに足す回転（x, y, z） */
export type Pose = Record<string, [number, number, number]>;

export interface RigContext {
  /** 今の状態（戦闘の状態名、またはムービーの様子） */
  state: string;
  /** 今の状態になってからの秒数 */
  inState: number;
  /** 経過時間（秒） */
  t: number;
  /** 地面を動く速さ（m/秒） */
  speed: number;
  /** 歩いた距離の合計（歩く足の運びに使う） */
  walked: number;
  dt: number;
}

export interface Rig {
  update(dt: number, state: string): void;
}

/**
 * joints の各関節を、pose が返す目標へ近づける。rate は近づく速さ（大きいほど速い）。
 * extra は毎フレーム呼ばれる追加の動き（煙・目の光など）
 */
export function makeRig(
  root: THREE.Object3D,
  joints: Record<string, THREE.Object3D>,
  pose: (c: RigContext) => { pose: Pose; rate: number },
  extra?: (c: RigContext) => void,
): Rig {
  const base = new Map<string, THREE.Euler>();
  const cur = new Map<string, THREE.Vector3>();
  for (const [name, j] of Object.entries(joints)) {
    base.set(name, j.rotation.clone());
    cur.set(name, new THREE.Vector3());
  }
  let state = '';
  let since = 0;
  let t = Math.random() * 100;
  let walked = 0;
  const last = new THREE.Vector3().copy(root.position);
  let speed = 0;
  return {
    update(dt: number, s: string): void {
      dt = Math.min(dt, 0.1);
      t += dt;
      if (s !== state) {
        state = s;
        since = 0;
      } else since += dt;
      const moved = Math.hypot(root.position.x - last.x, root.position.z - last.z);
      last.copy(root.position);
      walked += moved;
      speed += ((dt > 0 ? moved / dt : 0) - speed) * Math.min(1, dt * 6);
      const c: RigContext = { state, inState: since, t, speed, walked, dt };
      const { pose: p, rate } = pose(c);
      const k = 1 - Math.exp(-dt * rate);
      for (const [name, j] of Object.entries(joints)) {
        const target = p[name] ?? [0, 0, 0];
        const v = cur.get(name)!;
        v.x += (target[0] - v.x) * k;
        v.y += (target[1] - v.y) * k;
        v.z += (target[2] - v.z) * k;
        const b = base.get(name)!;
        j.rotation.set(b.x + v.x, b.y + v.y, b.z + v.z, b.order);
      }
      extra?.(c);
    },
  };
}

/** なめらかな揺らぎ（いくつかの正弦波の重ね合わせ。-1〜1 くらい） */
export function wave(t: number, f: number, seed = 0): number {
  return Math.sin(t * f + seed) * 0.6 + Math.sin(t * f * 1.73 + seed * 2.1) * 0.3 + Math.sin(t * f * 3.11 + seed * 0.7) * 0.1;
}

/** 0 から 1 へ、ゆっくり立ち上がる（状態が変わってからの時間などに） */
export function ease(x: number): number {
  const c = Math.min(1, Math.max(0, x));
  return c * c * (3 - 2 * c);
}
