import * as THREE from 'three';
import type { WorldBuilder } from '../../world/builder';

/*
 * 住宅街の家並み（塀の向こうに見える家）。中には入らない、外側だけの家。
 * 壁・屋根は builder の材質（写真の質感）でまとめて描く。
 */

/** 毎回同じ並びになる乱数 */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let warmMat: THREE.MeshBasicMaterial | null = null;

/** 位置だけの形に、法線と（あとで builder が上書きする）UV を足す */
function finish(pos: number[]): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((pos.length / 3) * 2), 2));
  geo.computeVertexNormals();
  return geo;
}

/**
 * 切妻屋根（棟は x 方向）。x1〜x2, z1〜z2 を覆い、軒は eave だけ張り出す。
 * y は軒の高さ、rise は棟までの高さ
 */
export function gableRoof(b: WorldBuilder, x1: number, x2: number, z1: number, z2: number, y: number, rise: number, eave: number): void {
  const zc = (z1 + z2) / 2;
  const a = [x1 - eave, x2 + eave];
  const za = z1 - eave;
  const zb = z2 + eave;
  const ridge = y + rise;
  const t = 0.12;
  // 2 枚の屋根面（厚みつき）
  for (const [zEdge, sgn] of [
    [za, -1],
    [zb, 1],
  ] as const) {
    const v = [
      [a[0], y, zEdge],
      [a[1], y, zEdge],
      [a[1], ridge, zc],
      [a[0], ridge, zc],
    ];
    const pos: number[] = [];
    const quad = (p: number[][], flip: boolean) => {
      const [p0, p1, p2, p3] = flip ? [p[1], p[0], p[3], p[2]] : p;
      pos.push(...p0, ...p1, ...p2, ...p0, ...p2, ...p3);
    };
    quad(v, sgn < 0);
    // 裏（軒下）と、軒先の小口
    const under = v.map(([x, yy, z]) => [x, yy - t, z]);
    quad(under, sgn > 0);
    quad([v[0], v[1], under[1], under[0]], sgn > 0);
    b.mesh(finish(pos), 'roof');
  }
  // 妻側の三角の壁
  for (const x of [x1, x2]) {
    const pos = [x, y, z1, x, y, z2, x, ridge - 0.05, zc];
    // x1 側は -x、x2 側は +x を表にする
    b.mesh(finish(x === x1 ? pos : [pos[0], pos[1], pos[2], pos[6], pos[7], pos[8], pos[3], pos[4], pos[5]]), 'homeWall');
  }
}

/**
 * 塀の向こうの 2 階建ての家。front は道に面した壁の z、depth は奥行き（向きは dir）。
 * 窓・雨どい・室外機をつけ、ところどころ窓に明かりがともる
 */
export function townHouse(b: WorldBuilder, x1: number, x2: number, front: number, dir: 1 | -1, seed: number, opts: { depth?: number; floors?: 1 | 2 } = {}): void {
  const rand = rng(seed);
  const depth = opts.depth ?? 6;
  const floors = opts.floors ?? (rand() < 0.75 ? 2 : 1);
  const h = floors === 2 ? 5.4 : 2.9;
  const zf = front;
  const zb = front + dir * depth;
  const [za, zz] = zf < zb ? [zf, zb] : [zb, zf];
  const wall = rand() < 0.5 ? 'homeWall' : 'plaster';
  b.box([x1, 0, za], [x2, h, zz], wall);
  // 1 階と 2 階の間の小さな庇・基礎
  b.box([x1 - 0.02, 0, za - 0.02], [x2 + 0.02, 0.35, zz + 0.02], 'concrete');
  if (floors === 2) {
    const zE = zf - dir * 0.45;
    b.box([x1 - 0.1, 2.75, Math.min(zf, zE)], [x2 + 0.1, 2.85, Math.max(zf, zE)], 'roof');
  }
  gableRoof(b, x1, x2, za, zz, h, 1.4 + rand() * 0.4, 0.5);

  // 道側の窓：アルミ枠・暗いガラス・ところどころに明かり
  warmMat ??= new THREE.MeshBasicMaterial({ color: 0x6a4a28 });
  const wf = zf - dir * 0.02;
  const levels = floors === 2 ? [1.0, 3.6] : [1.0];
  for (const y0 of levels) {
    const count = Math.max(1, Math.floor((x2 - x1) / 2.4));
    for (let i = 0; i < count; i++) {
      if (rand() < 0.2) continue;
      const cx = x1 + ((i + 0.5) * (x2 - x1)) / count;
      const w = 0.9 + rand() * 0.5;
      const hh = 1.0 + rand() * 0.2;
      const lit = rand() < 0.18;
      const glass = new THREE.Mesh(new THREE.PlaneGeometry(w, hh), lit ? warmMat : b.mat('glassDark'));
      glass.position.set(cx, y0 + hh / 2, wf);
      glass.rotation.y = dir > 0 ? Math.PI : 0;
      b.staticMesh(glass);
      // 枠と、真ん中の召し合わせ
      const fz1 = Math.min(wf, wf - dir * 0.05);
      const fz2 = Math.max(wf, wf - dir * 0.05);
      b.box([cx - w / 2 - 0.04, y0 - 0.04, fz1], [cx + w / 2 + 0.04, y0, fz2], 'metal');
      b.box([cx - w / 2 - 0.04, y0 + hh, fz1], [cx + w / 2 + 0.04, y0 + hh + 0.04, fz2], 'metal');
      b.box([cx - w / 2 - 0.04, y0, fz1], [cx - w / 2, y0 + hh, fz2], 'metal');
      b.box([cx + w / 2, y0, fz1], [cx + w / 2 + 0.04, y0 + hh, fz2], 'metal');
      b.box([cx - 0.015, y0, fz1], [cx + 0.015, y0 + hh, fz2], 'metal');
      // 2 階の窓には、面格子か手すり
      if (y0 > 2 && rand() < 0.5) {
        for (let k = 0; k <= 6; k++) {
          const gx = cx - w / 2 + (w * k) / 6;
          b.box([gx - 0.01, y0 - 0.05, Math.min(wf, wf - dir * 0.12)], [gx + 0.01, y0 + 0.55, Math.max(wf, wf - dir * 0.12)], 'rail');
        }
        b.box([cx - w / 2 - 0.05, y0 + 0.55, Math.min(wf, wf - dir * 0.14)], [cx + w / 2 + 0.05, y0 + 0.6, Math.max(wf, wf - dir * 0.14)], 'rail');
      }
    }
  }
  // 雨どい（縦）
  const gx = rand() < 0.5 ? x1 + 0.12 : x2 - 0.12;
  const pipe = new THREE.CylinderGeometry(0.04, 0.04, h, 8);
  pipe.translate(gx, h / 2, zf - dir * 0.08);
  b.mesh(pipe, 'rail');
  // エアコンの室外機
  if (rand() < 0.7) {
    const ax = x1 + 0.6 + rand() * (x2 - x1 - 1.6);
    const az1 = Math.min(zf, zf - dir * 0.3);
    const az2 = Math.max(zf, zf - dir * 0.3);
    b.box([ax, 0.35, az1], [ax + 0.8, 0.95, az2], 'porcelain');
    const fan = new THREE.CircleGeometry(0.2, 16);
    fan.rotateY(dir > 0 ? Math.PI : 0);
    fan.translate(ax + 0.32, 0.65, zf - dir * 0.305);
    b.mesh(fan, 'dark');
  }
}

/** ブロック塀：控え壁と笠木（上の縁）つき */
export function blockWall(b: WorldBuilder, x1: number, x2: number, z: number, h: number, inward: 1 | -1): void {
  b.box([x1, 0, z - 0.06], [x2, h, z + 0.06], 'fence', { collide: true });
  b.box([x1, h, z - 0.08], [x2, h + 0.05, z + 0.08], 'concrete');
  // 控え壁（3.2m ごと、家の側に出す）
  for (let x = x1 + 1.6; x < x2 - 0.5; x += 3.2) {
    const z1 = z + inward * 0.06;
    const z2 = z + inward * 0.45;
    b.box([x - 0.06, 0, Math.min(z1, z2)], [x + 0.06, h - 0.3, Math.max(z1, z2)], 'fence');
  }
}
