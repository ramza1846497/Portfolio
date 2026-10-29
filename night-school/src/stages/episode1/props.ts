import * as THREE from 'three';
import { signTexture } from '../../engine/textures';
import type { WorldBuilder } from '../../world/builder';
import { pbrMaterial } from '../../world/pbr';

/**
 * 細かく作り込んだ小物。箱を並べただけに見えないよう、丸み・枠・つまみ・すき間を付け、写真の質感を貼る。
 * 動かない物は builder.mesh / box で材質ごとにまとめて描く。当たり判定は呼び出し側（今までと同じ）。
 */

type V3 = [number, number, number];

/** geometry を回して置いてから、静的な物としてまとめる */
function put(b: WorldBuilder, geo: THREE.BufferGeometry, mat: string, pos: V3, rot: V3 = [0, 0, 0], scale: V3 = [1, 1, 1]): void {
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(...pos),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rot[0], rot[1], rot[2], 'YXZ')),
    new THREE.Vector3(...scale),
  );
  geo.applyMatrix4(m);
  b.mesh(geo, mat);
}

const cyl = (r1: number, r2: number, h: number, seg = 14) => new THREE.CylinderGeometry(r1, r2, h, seg);

// ---------------- 竹刀 ----------------

/** 竹刀：4 枚の竹、柄革、鍔、先革、中結、弦。原点は柄頭、+y が剣先（長さ約 1.18m） */
export function shinaiMesh(): THREE.Group {
  const g = new THREE.Group();
  const bamboo = pbrMaterial('bamboo', { repeat: 1 });
  const leatherW = new THREE.MeshStandardMaterial({ color: 0xe6dfcc, roughness: 0.8 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1c1a18, roughness: 0.6 });
  const L = 0.88;
  for (const [dx, dz] of [
    [-0.0085, -0.0085],
    [0.0085, -0.0085],
    [-0.0085, 0.0085],
    [0.0085, 0.0085],
  ]) {
    const slat = new THREE.Mesh(new THREE.BoxGeometry(0.0155, L, 0.0155), bamboo);
    slat.position.set(dx, 0.3 + L / 2, dz);
    g.add(slat);
  }
  const tsuka = new THREE.Mesh(cyl(0.019, 0.018, 0.29, 12), leatherW);
  tsuka.position.y = 0.145;
  g.add(tsuka);
  const tsuba = new THREE.Mesh(cyl(0.048, 0.048, 0.009, 24), dark);
  tsuba.position.y = 0.3;
  g.add(tsuba);
  const stop = new THREE.Mesh(cyl(0.022, 0.022, 0.02, 12), dark);
  stop.position.y = 0.315;
  g.add(stop);
  const saki = new THREE.Mesh(cyl(0.017, 0.019, 0.05, 12), leatherW);
  saki.position.y = 0.3 + L + 0.01;
  g.add(saki);
  const naka = new THREE.Mesh(cyl(0.02, 0.02, 0.018, 12), leatherW);
  naka.position.y = 0.3 + L * 0.72;
  g.add(naka);
  const tsuru = new THREE.Mesh(cyl(0.0016, 0.0016, L + 0.02, 4), new THREE.MeshStandardMaterial({ color: 0x1a2a5a }));
  tsuru.position.set(0, 0.3 + L / 2, 0.018);
  g.add(tsuru);
  return g;
}

/** 防具袋：くたっとした布の袋 */
export function boguBag(b: WorldBuilder, x: number, z: number): void {
  const bag = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 12), pbrMaterial('clothDark', { repeat: 3 }));
  bag.scale.set(1.15, 0.6, 0.55);
  bag.position.set(x, 0.17, z);
  b.add(bag);
  const strap = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.012, 6, 16, Math.PI), pbrMaterial('leather', { repeat: 2 }));
  strap.position.set(x, 0.3, z);
  b.add(strap);
}

// ---------------- 消火栓 ----------------

/** 屋内消火栓：赤い箱、扉の縁と取っ手、表示板、上の赤いランプ（いつも点いている）。face は箱の正面の向き（+z か -z） */
export function hydrantBox(b: WorldBuilder, x1: number, x2: number, wallZ: number, face: 1 | -1): void {
  const d = 0.16;
  const z1 = face > 0 ? wallZ : wallZ - d;
  const z2 = face > 0 ? wallZ + d : wallZ;
  const front = face > 0 ? z2 : z1;
  b.box([x1, 0.3, z1], [x2, 1.3, z2], 'hydrant');
  // 扉の縁（少し出ている）と取っ手
  const fz1 = face > 0 ? front : front - 0.012;
  const fz2 = face > 0 ? front + 0.012 : front;
  b.box([x1 + 0.03, 0.33, fz1], [x2 - 0.03, 0.36, fz2], 'hydrant');
  b.box([x1 + 0.03, 1.24, fz1], [x2 - 0.03, 1.27, fz2], 'hydrant');
  b.box([x1 + 0.03, 0.36, fz1], [x1 + 0.06, 1.24, fz2], 'hydrant');
  b.box([x2 - 0.06, 0.36, fz1], [x2 - 0.03, 1.24, fz2], 'hydrant');
  b.box([x2 - 0.14, 0.75, fz1], [x2 - 0.1, 0.9, fz2 + face * 0.02], 'metal');
  // 「消火栓」の表示
  const label = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.14), new THREE.MeshLambertMaterial({ map: signTexture('消火栓', '#f2ede2', '#b3221a') }));
  label.position.set((x1 + x2) / 2, 1.05, front + face * 0.014);
  if (face < 0) label.rotation.y = Math.PI;
  b.add(label);
  // 赤いランプ（にじむ光）と、まわりをうっすら照らす灯り
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.045, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xff3020 }));
  lamp.rotation.x = face * (Math.PI / 2);
  lamp.position.set((x1 + x2) / 2, 1.42, wallZ);
  b.add(lamp);
  b.box([(x1 + x2) / 2 - 0.06, 1.36, face > 0 ? wallZ : wallZ - 0.02], [(x1 + x2) / 2 + 0.06, 1.48, face > 0 ? wallZ + 0.02 : wallZ], 'metal');
  const glow = new THREE.PointLight(0xff2a1a, 0.5, 2.6, 2);
  glow.position.set((x1 + x2) / 2, 1.42, wallZ + face * 0.15);
  b.add(glow);
}

// ---------------- ロッカー・棚 ----------------

/** スチールのロッカー（掃除用具入れなど）。正面は +x 向き（x2 側） */
export function lockerX(b: WorldBuilder, x1: number, x2: number, z1: number, z2: number, h: number, mat = 'locker'): void {
  b.box([x1, 0.05, z1], [x2, h, z2], mat, { collide: true });
  b.box([x1 + 0.02, 0, z1 + 0.02], [x2 - 0.02, 0.05, z2 - 0.02], 'dark');
  const f = x2;
  const doors = Math.max(1, Math.round((z2 - z1) / 0.45));
  const w = (z2 - z1) / doors;
  for (let i = 0; i < doors; i++) {
    const a = z1 + i * w;
    // 扉のすき間・通気口・取っ手
    b.box([f, 0.06, a + 0.004], [f + 0.004, h - 0.02, a + 0.012], 'dark');
    for (const y of [h - 0.32, h - 0.26, h - 0.2, 0.2, 0.26]) b.box([f, y, a + w * 0.3], [f + 0.003, y + 0.018, a + w * 0.7], 'dark');
    b.box([f, h * 0.55, a + w - 0.1], [f + 0.025, h * 0.55 + 0.12, a + w - 0.07], 'metal');
  }
}

/** 下駄箱：板を組んだ小さな棚（両面から使う）と、ところどころに残った上履き */
export function shoeLocker(b: WorldBuilder, x1: number, x2: number, zc: number, redShoe: boolean): void {
  const h = 1.8;
  const d = 0.2;
  const t = 0.018;
  b.collision.add(x1, zc - d, x2, zc + d);
  // 外枠・台輪・天板・背板（真ん中）
  b.box([x1, 0, zc - d], [x1 + t, h, zc + d], 'wood');
  b.box([x2 - t, 0, zc - d], [x2, h, zc + d], 'wood');
  b.box([x1, 0, zc - d + 0.02], [x2, 0.08, zc + d - 0.02], 'dark');
  b.box([x1 - 0.01, h, zc - d - 0.015], [x2 + 0.01, h + 0.035, zc + d + 0.015], 'wood');
  b.box([x1, 0.08, zc - 0.006], [x2, h, zc + 0.006], 'wood');
  const cols = Math.round((x2 - x1) / 0.3);
  const cw = (x2 - x1) / cols;
  const rows = 6;
  const rh = (h - 0.08) / rows;
  for (let r = 0; r <= rows; r++) b.box([x1, 0.08 + r * rh - t / 2, zc - d], [x2, 0.08 + r * rh + t / 2, zc + d], 'wood');
  for (let c = 1; c < cols; c++) b.box([x1 + c * cw - t / 2, 0.08, zc - d], [x1 + c * cw + t / 2, h, zc + d], 'wood');
  // 上履き（白いズック、つま先にゴム）
  let seed = Math.floor(x1 * 7 + zc * 13);
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      for (const side of [-1, 1]) {
        if (rnd() > 0.28) continue;
        const cx = x1 + c * cw + cw / 2;
        const y = 0.08 + r * rh + t / 2;
        const z = zc + side * 0.1;
        for (const dx of [-0.045, 0.045]) {
          b.box([cx + dx - 0.035, y, z - 0.09], [cx + dx + 0.035, y + 0.045, z + 0.09], 'porcelain');
          b.box([cx + dx - 0.036, y, z + side * 0.06 - 0.03], [cx + dx + 0.036, y + 0.02, z + side * 0.06 + 0.03], r === 2 && redShoe && c === 1 ? 'red' : 'metalGray');
        }
      }
    }
  }
}

/** 教卓：天板が少し張り出し、前板にくぼみのある木の台 */
export function podium(b: WorldBuilder, x1: number, x2: number, z1: number, z2: number): void {
  b.box([x1 + 0.03, 0, z1 + 0.03], [x2 - 0.03, 0.06, z2 - 0.03], 'dark');
  b.box([x1, 0.06, z1], [x2, 0.95, z2], 'wood', { collide: true });
  b.box([x1 - 0.04, 0.95, z1 - 0.04], [x2 + 0.04, 1.0, z2 + 0.04], 'wood');
  // 前板（+x 側）の飾り枠
  b.box([x2, 0.15, z1 + 0.1], [x2 + 0.012, 0.85, z1 + 0.14], 'wood');
  b.box([x2, 0.15, z2 - 0.14], [x2 + 0.012, 0.85, z2 - 0.1], 'wood');
  b.box([x2, 0.81, z1 + 0.14], [x2 + 0.012, 0.85, z2 - 0.14], 'wood');
  b.box([x2, 0.15, z1 + 0.14], [x2 + 0.012, 0.19, z2 - 0.14], 'wood');
}

/** 黒板のまわり：アルミの枠、チョーク受けとチョーク、黒板消し */
export function blackboardTrim(b: WorldBuilder, x: number, zc: number, facing: 1 | -1, w = 4, h = 1.5, yc = 1.55): void {
  const f = x + facing * 0.11;
  const out = facing * 0.03;
  const lo = Math.min(f, f + out);
  const hi = Math.max(f, f + out);
  b.box([lo, yc + h / 2, zc - w / 2 - 0.04], [hi, yc + h / 2 + 0.04, zc + w / 2 + 0.04], 'frame');
  b.box([lo, yc - h / 2 - 0.04, zc - w / 2 - 0.04], [hi, yc - h / 2, zc + w / 2 + 0.04], 'frame');
  b.box([lo, yc - h / 2, zc - w / 2 - 0.04], [hi, yc + h / 2, zc - w / 2], 'frame');
  b.box([lo, yc - h / 2, zc + w / 2], [hi, yc + h / 2, zc + w / 2 + 0.04], 'frame');
  // チョーク受け
  const t1 = Math.min(f, f + facing * 0.1);
  const t2 = Math.max(f, f + facing * 0.1);
  b.box([t1, yc - h / 2 - 0.07, zc - w / 2], [t2, yc - h / 2 - 0.05, zc + w / 2], 'frame');
  const chalk: [number, number][] = [
    [-1.2, 0xf2efe6],
    [-1.05, 0xf2efe6],
    [0.4, 0xd84a3a],
    [0.55, 0xe8d050],
  ];
  for (const [dz, color] of chalk) {
    const c = new THREE.Mesh(cyl(0.006, 0.006, 0.07, 8), new THREE.MeshStandardMaterial({ color, roughness: 1 }));
    c.rotation.x = Math.PI / 2;
    c.position.set(f + facing * 0.05, yc - h / 2 - 0.044, zc + dz);
    b.add(c);
  }
  b.box([f + facing * 0.02, yc - h / 2 - 0.05, zc + 1.2], [f + facing * 0.07, yc - h / 2 - 0.02, zc + 1.33], 'clothDark');
}

// ---------------- 理科室 ----------------

/** 実験台：黒い天板、流し、ガス栓、引き出しの台。まわりに丸椅子 */
export function labBench(b: WorldBuilder, x: number, z: number, onTop: 'burner' | 'microscope' | 'chem' | 'none'): void {
  b.box([x - 0.88, 0.08, z - 0.58], [x + 0.88, 0.8, z + 0.58], 'locker', { collide: true });
  b.box([x - 0.85, 0, z - 0.55], [x + 0.85, 0.08, z + 0.55], 'dark');
  for (const sx of [-0.44, 0, 0.44]) {
    for (const side of [-1, 1]) {
      const fz = z + side * 0.58;
      b.box([x + sx - 0.004, 0.1, Math.min(fz, fz + side * 0.003)], [x + sx + 0.004, 0.78, Math.max(fz, fz + side * 0.003)], 'dark');
      b.box([x + sx + 0.15, 0.62, Math.min(fz, fz + side * 0.02)], [x + sx + 0.25, 0.64, Math.max(fz, fz + side * 0.02)], 'metal');
    }
  }
  b.box([x - 0.95, 0.8, z - 0.65], [x + 0.95, 0.86, z + 0.65], 'labTop');
  // 流し（くぼみ）と蛇口
  b.box([x - 0.22, 0.861, z - 0.17], [x + 0.22, 0.863, z + 0.17], 'glassDark');
  const faucet = cyl(0.012, 0.012, 0.28, 8);
  put(b, faucet, 'metal', [x, 1.0, z - 0.26]);
  put(b, cyl(0.01, 0.01, 0.16, 8), 'metal', [x, 1.13, z - 0.19], [Math.PI / 2, 0, 0]);
  // ガス栓
  for (const sx of [-0.7, 0.7]) put(b, cyl(0.02, 0.025, 0.05, 10), 'metal', [x + sx, 0.885, z]);
  if (onTop === 'burner') {
    b.prop('bunsen_burner', [x - 0.55, 0.86, z + 0.25], 0.3);
    b.prop('bunsen_burner', [x + 0.5, 0.86, z - 0.3], 2.1);
  } else if (onTop === 'microscope') {
    b.prop('vintage_microscope', [x + 0.45, 0.86, z + 0.2], -0.8);
  } else if (onTop === 'chem') {
    b.prop('chemistry_set', [x + 0.2, 0.86, z + 0.32], Math.PI);
  }
  // 丸椅子
  for (const [sx, sz] of [
    [-0.6, -0.95],
    [0.6, -0.95],
    [-0.6, 0.95],
    [0.6, 0.95],
  ]) {
    put(b, cyl(0.17, 0.17, 0.04, 20), 'wood', [x + sx, 0.58, z + sz]);
    put(b, cyl(0.025, 0.03, 0.56, 8), 'metal', [x + sx, 0.29, z + sz]);
    put(b, cyl(0.16, 0.18, 0.03, 16), 'metal', [x + sx, 0.015, z + sz]);
  }
}

/** 標本棚：ガラスの瓶に、濁った液と、何かの標本 */
export function specimenShelf(b: WorldBuilder, x1: number, x2: number, z1: number, z2: number): void {
  b.box([x1, 0, z1], [x2, 1.9, z2], 'wood', { collide: true });
  // 前面（-x 側）は中が見える棚
  const f = x1 - 0.002;
  b.box([x1 - 0.01, 0, z1], [x1 + 0.02, 1.9, z1 + 0.04], 'wood');
  b.box([x1 - 0.01, 0, z2 - 0.04], [x1 + 0.02, 1.9, z2], 'wood');
  const glass = new THREE.MeshStandardMaterial({ color: 0xc8d8d0, roughness: 0.05, transparent: true, opacity: 0.22, depthWrite: false });
  const liquid = new THREE.MeshStandardMaterial({ color: 0xb89a48, roughness: 0.3, transparent: true, opacity: 0.55, depthWrite: false });
  const thing = new THREE.MeshStandardMaterial({ color: 0x5a4a3c, roughness: 0.6 });
  for (const y of [0.95, 1.4]) {
    b.box([x1 - 0.06, y - 0.02, z1], [x2, y, z2], 'wood');
    for (let z = z1 + 0.3; z < z2 - 0.2; z += 0.55) {
      const jar = new THREE.Mesh(cyl(0.085, 0.085, 0.26, 18), glass);
      jar.position.set(f - 0.08, y + 0.13, z);
      b.add(jar);
      const liq = new THREE.Mesh(cyl(0.078, 0.078, 0.2, 18), liquid);
      liq.position.set(f - 0.08, y + 0.1, z);
      b.add(liq);
      const s = new THREE.Mesh(new THREE.IcosahedronGeometry(0.045, 1), thing);
      s.scale.set(1, 1.5 + (z % 0.3), 0.8);
      s.position.set(f - 0.08, y + 0.1, z);
      b.add(s);
      put(b, cyl(0.09, 0.09, 0.025, 18), 'dark', [f - 0.08, y + 0.27, z]);
    }
  }
}

// ---------------- トイレ ----------------

/** 和式便器：楕円の受け口と、前の覆い（金隠し）、奥の水洗管とレバー */
export function squatToilet(b: WorldBuilder, cx: number, z0: number, z1: number, back: number): void {
  const zc = (z0 + z1) / 2;
  const len = z1 - z0;
  put(b, cyl(0.2, 0.2, 0.04, 28), 'porcelain', [cx, 0.02, zc], [0, 0, 0], [1, 1, len / 0.4]);
  put(b, cyl(0.15, 0.13, 0.025, 28), 'glassDark', [cx, 0.03, zc + 0.03], [0, 0, 0], [0.9, 1, (len - 0.12) / 0.3]);
  // 金隠し（前の半円の覆い）
  const hood = new THREE.CylinderGeometry(0.18, 0.18, 0.18, 20, 1, false, -Math.PI / 2, Math.PI);
  put(b, hood, 'porcelain', [cx, 0.11, z0 + 0.05], [Math.PI / 2, 0, 0], [1, 1, 0.6]);
  // 水洗管とレバー
  put(b, cyl(0.016, 0.016, 1.1, 10), 'metal', [cx + 0.3, 0.6, back - 0.05]);
  put(b, cyl(0.012, 0.012, 0.18, 8), 'metal', [cx + 0.3, 1.1, back - 0.12], [Math.PI / 2, 0, 0]);
  b.box([cx + 0.24, 1.15, back - 0.16], [cx + 0.36, 1.25, back - 0.06], 'porcelain');
}

/** 手洗い場の蛇口（曲がった管とハンドル） */
export function faucet(b: WorldBuilder, x: number, y: number, z: number): void {
  put(b, cyl(0.012, 0.012, 0.16, 10), 'metal', [x, y + 0.08, z]);
  put(b, cyl(0.011, 0.009, 0.14, 10), 'metal', [x - 0.06, y + 0.155, z], [0, 0, Math.PI / 2]);
  put(b, cyl(0.025, 0.025, 0.02, 12), 'metal', [x, y + 0.17, z]);
}

// ---------------- 道路 ----------------

/** コンクリートの電柱：細くなる柱、腕木、碍子、ところどころに変圧器と街灯 */
export function utilityPole(b: WorldBuilder, x: number, z: number, opts: { transformer?: boolean; lamp?: boolean } = {}): void {
  put(b, cyl(0.12, 0.16, 8, 14), 'concrete', [x, 4, z]);
  b.box([x - 0.6, 7.2, z - 0.05], [x + 0.6, 7.3, z + 0.05], 'metal');
  b.box([x - 0.5, 6.5, z - 0.05], [x + 0.5, 6.58, z + 0.05], 'metal');
  for (const dx of [-0.5, 0, 0.5]) put(b, cyl(0.035, 0.05, 0.1, 10), 'porcelain', [x + dx, 7.36, z]);
  for (const dx of [-0.4, 0.4]) put(b, cyl(0.03, 0.045, 0.09, 10), 'porcelain', [x + dx, 6.63, z]);
  // 足場ボルト
  for (let y = 2.2; y < 6.2; y += 0.45) b.box([x - 0.2, y, z - 0.012], [x + 0.2, y + 0.024, z + 0.012], 'metal');
  if (opts.transformer) {
    put(b, cyl(0.22, 0.22, 0.7, 16), 'metalGray', [x + 0.38, 5.6, z]);
    b.box([x + 0.12, 5.75, z - 0.04], [x + 0.18, 5.85, z + 0.04], 'metal');
  }
  if (opts.lamp) {
    b.box([x - 0.05, 5.0, z - 1.4], [x + 0.05, 5.06, z], 'pole');
  }
}

/** ガードレール：白い支柱と、波形の板（2 本の膨らみ） */
export function guardRail(b: WorldBuilder, x1: number, x2: number, z: number, side: 1 | -1): void {
  for (let x = x1; x <= x2; x += 2) put(b, cyl(0.05, 0.05, 0.8, 10), 'rail', [x, 0.4, z]);
  const f = z - side * 0.06;
  for (const y of [0.6, 0.72]) put(b, cyl(0.045, 0.045, x2 - x1, 10), 'rail', [(x1 + x2) / 2, y, f], [0, 0, Math.PI / 2], [1, 1, 0.45]);
  b.box([x1, 0.58, Math.min(f, f + side * 0.02)], [x2, 0.74, Math.max(f, f + side * 0.02)], 'rail');
}

// ---------------- 民家 ----------------

/** ダイヤル式の電話機（本体・受話器・ダイヤル）。原点は底の中心、正面は +x */
export function dialPhone(color: number): THREE.Group {
  const g = new THREE.Group();
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.25, metalness: 0 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.11, 0.085, 4, 1), m);
  body.rotation.y = Math.PI / 4;
  body.scale.set(1, 1, 1.1);
  body.position.y = 0.043;
  g.add(body);
  // 受話器：両端がふくらんだ棒
  const grip = new THREE.Mesh(new THREE.CapsuleGeometry(0.018, 0.16, 4, 10), m);
  grip.rotation.x = Math.PI / 2;
  grip.position.set(-0.01, 0.105, 0);
  g.add(grip);
  for (const z of [-0.095, 0.095]) {
    const cup = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 8), m);
    cup.scale.set(1, 0.7, 1);
    cup.position.set(-0.01, 0.1, z);
    g.add(cup);
  }
  // ダイヤル
  const dial = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.008, 8, 20), new THREE.MeshStandardMaterial({ color: 0xd8d4c8, roughness: 0.4 }));
  dial.rotation.set(0, Math.PI / 2, 0.6);
  dial.position.set(0.075, 0.05, 0);
  g.add(dial);
  return g;
}

/** ちゃぶ台：丸い天板と脚。お茶の道具を載せる */
export function chabudai(b: WorldBuilder, x: number, z: number, r: number): void {
  put(b, cyl(r, r, 0.035, 32), 'wood', [x, 0.33, z]);
  put(b, cyl(r - 0.03, r - 0.03, 0.02, 32), 'dark', [x, 0.305, z]);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    b.box([x + Math.cos(a) * r * 0.6 - 0.025, 0, z + Math.sin(a) * r * 0.6 - 0.025], [x + Math.cos(a) * r * 0.6 + 0.025, 0.3, z + Math.sin(a) * r * 0.6 + 0.025], 'wood');
  }
  b.collision.add(x - r, z - r, x + r, z + r);
  b.prop('tea_set_01', [x, 0.35, z], 0.4, 0.5);
}

/** 箪笥：引き出しの段と、金具の取っ手。正面は +x 向き */
export function tansu(b: WorldBuilder, x1: number, x2: number, z1: number, z2: number, h: number): void {
  b.box([x1, 0, z1], [x2, h, z2], 'wood', { collide: true });
  const rows = Math.max(2, Math.round(h / 0.22));
  const rh = h / rows;
  for (let r = 0; r < rows; r++) {
    const y = r * rh;
    b.box([x2, y + rh - 0.008, z1], [x2 + 0.006, y + rh, z2], 'dark');
    for (const zz of rows > 2 && r === rows - 1 ? [(z1 + z2) / 2] : [z1 + (z2 - z1) * 0.28, z2 - (z2 - z1) * 0.28]) {
      b.box([x2, y + rh * 0.45, zz - 0.04], [x2 + 0.02, y + rh * 0.55, zz + 0.04], 'gold');
    }
  }
}

/** 脚のある机・台（天板・幕板・4 本脚） */
export function leggedTable(b: WorldBuilder, x1: number, x2: number, z1: number, z2: number, h: number, mat = 'wood'): void {
  b.box([x1, h - 0.03, z1], [x2, h, z2], mat);
  b.box([x1 + 0.03, h - 0.12, z1 + 0.03], [x2 - 0.03, h - 0.03, z2 - 0.03], mat);
  for (const x of [x1 + 0.03, x2 - 0.07]) for (const z of [z1 + 0.03, z2 - 0.07]) b.box([x, 0, z], [x + 0.04, h - 0.03, z + 0.04], mat);
  b.collision.add(x1, z1, x2, z2);
}

/** 布張りのソファ（座面・背もたれ・ひじ掛け）。背もたれは -z 側 */
export function sofa(b: WorldBuilder, x1: number, x2: number, z1: number, z2: number): void {
  const cloth = pbrMaterial('fleece', { repeat: 2 });
  const part = (w: number, h: number, d: number, x: number, y: number, z: number) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d, 2, 2, 2), cloth);
    m.position.set(x, y, z);
    b.add(m);
  };
  const cx = (x1 + x2) / 2;
  part(x2 - x1 - 0.3, 0.16, z2 - z1 - 0.18, cx, 0.36, (z1 + z2) / 2 + 0.06);
  part(x2 - x1, 0.28, z2 - z1, cx, 0.14, (z1 + z2) / 2);
  part(x2 - x1, 0.42, 0.18, cx, 0.5, z1 + 0.09);
  for (const x of [x1 + 0.09, x2 - 0.09]) part(0.18, 0.32, z2 - z1, x, 0.44, (z1 + z2) / 2);
  b.collision.add(x1, z1, x2, z2);
}

/** 古い冷蔵庫：角の丸い白い箱に、扉の分かれ目と取っ手。正面は +x */
export function oldFridge(b: WorldBuilder, x1: number, x2: number, z1: number, z2: number, h: number): void {
  b.box([x1, 0.04, z1], [x2, h, z2], 'porcelain', { collide: true });
  b.box([x1 + 0.02, 0, z1 + 0.02], [x2 - 0.02, 0.04, z2 - 0.02], 'dark');
  b.box([x2, h * 0.62, z1], [x2 + 0.004, h * 0.62 + 0.012, z2], 'dark');
  for (const y of [h * 0.68, h * 0.4]) b.box([x2, y, z2 - 0.1], [x2 + 0.03, y + 0.18, z2 - 0.07], 'metal');
}
