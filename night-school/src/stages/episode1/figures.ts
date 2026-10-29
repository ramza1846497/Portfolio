import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { WorldBuilder } from '../../world/builder';
import { muscleTexture } from '../../engine/textures';
import { pbrMaterial } from '../../world/pbr';
import { ease, makeRig, wave, type Pose, type RigContext } from './rig';

/*
 * 人の形をした登場人物・敵。写真の質感（布・陶器のような肌・石）を組み合わせ、
 * 髪は一本ずつの房で作る。原点は足元、正面は +z。
 */

/** 毎回同じ形になる乱数 */
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

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

function lathe(pts: [number, number][], segs = 24, phiStart = 0, phiLength = Math.PI * 2): THREE.LatheGeometry {
  return new THREE.LatheGeometry(
    pts.map(([r, y]) => new THREE.Vector2(r, y)),
    segs,
    phiStart,
    phiLength,
  );
}

/** a から b へ伸びる、先細りの円柱（関節の球つき） */
function limb(parent: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3, r1: number, r2: number, mat: THREE.Material, joint = true): THREE.Mesh {
  const d = b.clone().sub(a);
  const len = d.length();
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r2, r1, len, 10, 1), mat);
  m.position.copy(a).addScaledVector(d, 0.5);
  m.quaternion.setFromUnitVectors(V(0, 1, 0), d.normalize());
  parent.add(m);
  if (joint) {
    const j = new THREE.Mesh(new THREE.SphereGeometry(r1, 10, 8), mat);
    j.position.copy(a);
    parent.add(j);
  }
  return m;
}

/** 手：手首 wrist から、下へ向けた手のひらと指。指の付け根の組を返す（動かす用） */
function hand(parent: THREE.Object3D, wrist: THREE.Vector3, side: number, mat: THREE.Material, fingerLen: number, out: THREE.Group[] = []): THREE.Group[] {
  const palm = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), mat);
  palm.scale.set(0.55, 1.1, 0.9);
  palm.position.copy(wrist).add(V(0, -0.028, 0));
  parent.add(palm);
  for (let i = 0; i < 4; i++) {
    const root = new THREE.Group();
    root.position.copy(wrist).add(V(side * 0.004, -0.058, -0.017 + i * 0.012));
    root.rotation.x = (i - 1.5) * 0.08;
    const len = fingerLen * (i === 0 || i === 3 ? 0.82 : 1);
    limb(root, V(0, 0, 0), V(0, -len * 0.55, 0.002), 0.006, 0.0055, mat);
    const tip = new THREE.Group();
    tip.position.set(0, -len * 0.55, 0.002);
    limb(tip, V(0, 0, 0), V(0, -len * 0.45, 0.004), 0.0055, 0.0035, mat);
    root.add(tip);
    root.userData.tip = tip;
    parent.add(root);
    out.push(root);
  }
  // 親指
  limb(parent, wrist.clone().add(V(side * -0.005, -0.03, 0.02)), wrist.clone().add(V(side * -0.004, -0.03 - fingerLen * 0.6, 0.032)), 0.007, 0.004, mat);
  return out;
}

/**
 * 一本ずつの房でできた髪。頭（中心 c・半径 r）に沿って垂れ、下は cut(角度) の高さで切りそろえる。
 * 角度 theta は 0 が正面（+z）。
 */
function strandHair(o: {
  c: THREE.Vector3;
  r: number;
  count: number;
  len: (theta: number) => number;
  cut?: (theta: number) => number;
  width?: number;
  messy?: number;
  spread?: number;
  seed?: number;
  /** 分け目：この角度の範囲（正面寄り）には毛を生やさない */
  part?: [number, number];
}): THREE.BufferGeometry {
  const rand = rng(o.seed ?? 11);
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const N = 10;
  const width = o.width ?? 0.016;
  const messy = o.messy ?? 0.08;
  const spread = o.spread ?? 0.04;
  const down = V(0, -1, 0);
  for (let s = 0; s < o.count; s++) {
    const theta = rand() * Math.PI * 2;
    const signed = theta > Math.PI ? theta - Math.PI * 2 : theta;
    if (o.part && signed > o.part[0] && signed < o.part[1]) continue;
    // 生え際：正面はおでこの上まで、横・後ろは耳の上まで（間はなめらかにつなぐ）
    const maxPolar = 1.35 - 0.4 * THREE.MathUtils.smoothstep(Math.cos(theta), 0.2, 0.75);
    const polar = Math.acos(1 - rand() * (1 - Math.cos(maxPolar)));
    const hx = Math.sin(theta);
    const hz = Math.cos(theta);
    const p = o.c.clone().add(V(Math.sin(polar) * hx, Math.cos(polar), Math.sin(polar) * hz).multiplyScalar(o.r));
    let dir = V(Math.cos(polar) * hx, -Math.sin(polar), Math.cos(polar) * hz).normalize();
    const L = o.len(theta) * (0.85 + rand() * 0.3);
    const step = L / N;
    const cut = o.cut ? o.cut(theta) + (rand() - 0.5) * 0.008 : -Infinity;
    const pts: THREE.Vector3[] = [p.clone()];
    const jitter = V(rand() - 0.5, 0, rand() - 0.5).multiplyScalar(messy);
    for (let k = 0; k < N; k++) {
      p.addScaledVector(dir, step);
      // 頭にめりこまないよう押し出す
      const v = p.clone().sub(o.c);
      const d = v.length();
      if (d < o.r * 1.04) p.copy(o.c).addScaledVector(v, (o.r * 1.04) / d);
      if (p.y < cut) {
        p.y = cut;
        pts.push(p.clone());
        break;
      }
      pts.push(p.clone());
      const outward = V(hx, 0, hz).multiplyScalar(spread);
      dir = dir.lerp(down.clone().add(jitter).add(outward), 0.35).normalize();
    }
    if (pts.length < 2) continue;
    const base = pos.length / 3;
    const n = pts.length;
    for (let i = 0; i < n; i++) {
      const t = (pts[Math.min(i + 1, n - 1)].clone().sub(pts[Math.max(i - 1, 0)])).normalize();
      const out = pts[i].clone().sub(o.c).setY(0).normalize();
      const side = t.clone().cross(out).normalize();
      const w = width * (1 - 0.75 * (i / (n - 1)));
      for (const sgn of [-0.5, 0.5]) {
        const q = pts[i].clone().addScaledVector(side, w * sgn);
        pos.push(q.x, q.y, q.z);
        nor.push(out.x, 0.25, out.z);
        uv.push(sgn + 0.5, i / (n - 1));
      }
      if (i < n - 1) {
        const a = base + i * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.normalizeNormals();
  return g;
}

/** ぼんやりした丸（煙・光のにじみ用） */
let softDot: THREE.Texture | null = null;
function softTexture(): THREE.Texture {
  if (softDot) return softDot;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d')!;
  const grd = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.4, 'rgba(255,255,255,0.45)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, 64, 64);
  softDot = new THREE.CanvasTexture(c);
  return softDot;
}

/** 写真の布・肌に色をつける（元の布は明るい灰色なので、その分を持ち上げる） */
function tinted(key: string, color: number, base: number, o: { opacity: number; side?: THREE.Side; repeat?: number; roughness?: number }): THREE.MeshStandardMaterial {
  const c = new THREE.Color(color).multiplyScalar(1 / base);
  c.r = Math.min(1, c.r);
  c.g = Math.min(1, c.g);
  c.b = Math.min(1, c.b);
  return pbrMaterial(key, { color: c.getHex(), transparent: o.opacity < 1, opacity: o.opacity, side: o.side, repeat: o.repeat ?? 1, roughness: o.roughness });
}

/**
 * 顔の形をした頭（半径 r の球を、眼窩・鼻すじ・ほお・あごの形に押し引きする）。
 * socket は眼窩の深さ、cheek はほおのこけ具合（どちらも半径に対する割合）
 */
function headGeometry(r: number, socket: number, cheek = 0.02): THREE.BufferGeometry {
  const geo = new THREE.SphereGeometry(r, 36, 28);
  const pos = geo.getAttribute('position');
  const n = new THREE.Vector3();
  const bump = (nx: number, ny: number, cx: number, cy: number, sx: number, sy: number) => {
    const d = ((nx - cx) / sx) ** 2 + ((ny - cy) / sy) ** 2;
    return d < 1 ? (1 - d) ** 2 : 0;
  };
  for (let i = 0; i < pos.count; i++) {
    n.set(pos.getX(i), pos.getY(i), pos.getZ(i)).divideScalar(r);
    let k = 1;
    if (n.z > 0.3) {
      const f = Math.min(1, (n.z - 0.3) / 0.4);
      for (const ex of [-0.36, 0.36]) {
        k -= socket * bump(n.x, n.y, ex, 0.1, 0.22, 0.15) * f;
        k += 0.03 * bump(n.x, n.y, ex, 0.27, 0.26, 0.07) * f; // 眉の骨
        k -= cheek * bump(n.x, n.y, ex * 1.4, -0.3, 0.2, 0.25) * f;
      }
      k += 0.13 * bump(n.x, n.y, 0, -0.1, 0.09, 0.26) * f * (0.5 + Math.max(0, -n.y - 0.1) * 3); // 鼻
      k -= 0.04 * bump(n.x, n.y, 0, -0.43, 0.22, 0.04) * f; // 口の線
    }
    let x = n.x * k;
    let y = n.y * k;
    let z = n.z * k;
    if (y < 0) {
      // あごへ向かって細く、後頭部は丸く
      const t = -y;
      x *= 1 - 0.24 * t ** 1.4;
      if (z < 0) z *= 1 - 0.3 * t;
      y *= 1.08;
    }
    pos.setXYZ(i, x * r, y * r, z * r);
  }
  geo.computeVertexNormals();
  smoothSeam(geo);
  return geo;
}

/** 継ぎ目で分かれた頂点の法線をそろえる（球の継ぎ目に線が出ないように） */
function smoothSeam(geo: THREE.BufferGeometry): void {
  const pos = geo.getAttribute('position');
  const nor = geo.getAttribute('normal');
  const map = new Map<string, number[]>();
  for (let i = 0; i < pos.count; i++) {
    const key = `${pos.getX(i).toFixed(5)},${pos.getY(i).toFixed(5)},${pos.getZ(i).toFixed(5)}`;
    const list = map.get(key);
    if (list) list.push(i);
    else map.set(key, [i]);
  }
  const v = new THREE.Vector3();
  for (const list of map.values()) {
    if (list.length < 2) continue;
    v.set(0, 0, 0);
    for (const i of list) v.add(new THREE.Vector3(nor.getX(i), nor.getY(i), nor.getZ(i)));
    v.normalize();
    for (const i of list) nor.setXYZ(i, v.x, v.y, v.z);
  }
}

/** 頭の表面の点（頭の中心からの向き nx, ny。inset は表面から内へ入る割合） */
function facePoint(c: THREE.Vector3, r: number, scale: THREE.Vector3, nx: number, ny: number, inset: number): THREE.Vector3 {
  const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
  return V(nx * scale.x, ny * scale.y, nz * scale.z).multiplyScalar(r * (1 - inset)).add(c);
}

/**
 * 写真の質感を貼るための UV を、形の向きに合わせて付け直す（箱の 3 面から投影）。
 * 回転体の UV のままだと、石や布の模様が輪の縞に伸びてしまうため。perMeter は 1m あたりの繰り返し数
 */
function projectUVs(root: THREE.Object3D, perMeter: number): void {
  const p = new THREE.Vector3();
  const n = new THREE.Vector3();
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh) || !(o.material instanceof THREE.MeshStandardMaterial) || !o.material.map || o.userData.keepUV) return;
    const geo = o.geometry as THREE.BufferGeometry;
    const pos = geo.getAttribute('position');
    const nor = geo.getAttribute('normal');
    if (!nor) return;
    // 体全体の座標で投影すると、部品の継ぎ目でも模様がつながる
    const m = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld);
    const nm = new THREE.Matrix3().getNormalMatrix(m);
    const uv = new Float32Array(pos.count * 2);
    for (let i = 0; i < pos.count; i++) {
      p.fromBufferAttribute(pos, i).applyMatrix4(m);
      n.fromBufferAttribute(nor, i).applyMatrix3(nm);
      const ax = Math.abs(n.x);
      const ay = Math.abs(n.y);
      const az = Math.abs(n.z);
      let u: number;
      let v: number;
      if (ay >= ax && ay >= az) [u, v] = [p.x, p.z];
      else if (ax >= az) [u, v] = [p.z, p.y];
      else [u, v] = [p.x, p.y];
      uv[i * 2] = u * perMeter;
      uv[i * 2 + 1] = v * perMeter;
    }
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  });
}

/**
 * 雨だれ・すすの汚れ：頂点の色で、上から垂れた筋と足もとの黒ずみを描く（石像用）
 */
function weather(root: THREE.Object3D, seed: number): void {
  const rand = rng(seed);
  // 筋を流す位置（体のまわりの角度）と濃さ
  const streaks = Array.from({ length: 14 }, () => ({ a: rand() * Math.PI * 2, w: 0.08 + rand() * 0.16, k: 0.25 + rand() * 0.35 }));
  const p = new THREE.Vector3();
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const height = new THREE.Box3().setFromObject(root).max.y || 1;
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh) || !(o.material instanceof THREE.MeshStandardMaterial) || !o.material.map) return;
    const geo = o.geometry as THREE.BufferGeometry;
    const pos = geo.getAttribute('position');
    const m = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld);
    const col = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      p.fromBufferAttribute(pos, i).applyMatrix4(m);
      const a = Math.atan2(p.x, p.z);
      const h = p.y / height;
      let c = 0.55 + 0.45 * Math.min(1, h * 2.2); // 足もとほど黒ずむ
      for (const st of streaks) {
        let d = Math.abs(a - st.a);
        if (d > Math.PI) d = Math.PI * 2 - d;
        if (d < st.w) c -= st.k * (1 - d / st.w) * (0.4 + 0.6 * (1 - h));
      }
      c = Math.max(0.25, c);
      col[i * 3] = c;
      col[i * 3 + 1] = c * 0.98;
      col[i * 3 + 2] = c * 0.94;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    o.material.vertexColors = true;
  });
}

/**
 * container の中の部品を、材質ごとに 1 つのメッシュにまとめる（描く回数と影の計算を減らす）。
 * keep に入れた物（別に動かす・表示を切り替える物）と、その中身はまとめない。
 */
export function mergeParts(container: THREE.Object3D, keep: Set<THREE.Object3D> = new Set()): void {
  mergeByMaterial(container, keep);
}

function mergeByMaterial(container: THREE.Object3D, keep: Set<THREE.Object3D> = new Set()): void {
  container.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(container.matrixWorld).invert();
  const groups = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const done: THREE.Mesh[] = [];
  const visit = (o: THREE.Object3D) => {
    if (keep.has(o)) return;
    if (o instanceof THREE.Mesh && !Array.isArray(o.material)) {
      let geo = (o.geometry as THREE.BufferGeometry).clone();
      geo.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
      if (geo.index) geo = geo.toNonIndexed();
      for (const name of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(name)) geo.deleteAttribute(name);
      if (!geo.getAttribute('uv')) geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(geo.getAttribute('position').count * 2), 2));
      const list = groups.get(o.material) ?? [];
      list.push(geo);
      groups.set(o.material, list);
      done.push(o);
    }
    for (const c of o.children) visit(c);
  };
  for (const c of container.children) visit(c);
  for (const m of done) {
    m.removeFromParent();
    m.geometry.dispose();
  }
  // 中身がなくなった入れ物（関節の Group など）を片づける
  const prune = (o: THREE.Object3D) => {
    for (const c of [...o.children]) {
      if (keep.has(c)) continue;
      prune(c);
      if (c.type === 'Group' && c.children.length === 0) c.removeFromParent();
    }
  };
  prune(container);
  for (const [mat, geos] of groups) {
    const merged = mergeGeometries(geos);
    if (!merged) continue;
    container.add(new THREE.Mesh(merged, mat));
  }
}

/**
 * 半透明の人物を、いちばん手前の面だけ透けて見えるようにする。
 * 先に奥行きだけを書く（色は書かない）複製を描いておくと、体の奥の部品（後ろ髪・背中の肩ひもなど）が
 * 顔や服ごしに透けて見えなくなる。
 */
function depthPrepass(container: THREE.Object3D): void {
  const depthOnly = new THREE.MeshBasicMaterial({ colorWrite: false, side: THREE.DoubleSide });
  for (const c of [...container.children]) {
    if (!(c instanceof THREE.Mesh)) continue;
    const d = new THREE.Mesh(c.geometry, depthOnly);
    d.position.copy(c.position);
    d.quaternion.copy(c.quaternion);
    d.scale.copy(c.scale);
    d.renderOrder = -1;
    d.userData.depthOnly = true;
    container.add(d);
    const m = c.material as THREE.Material;
    m.depthWrite = false;
    m.depthFunc = THREE.LessEqualDepth;
  }
}

/**
 * ghostFigure の部品を、置かれた場所で関節に振り分ける（体の座標は身長 1.25m のとき）。
 *   頭（首より上）→ neck、腕と胸の前の手 → arms、股より下の脚 → hipL / hipR、残り → torso
 */
function splitJoints(g: THREE.Group, body: THREE.Group): void {
  const make = (name: string, parent: THREE.Object3D, x: number, y: number, z: number) => {
    const j = new THREE.Group();
    j.name = name;
    j.position.set(x, y, z);
    parent.add(j);
    return j;
  };
  const torso = make('torso', body, 0, 0.58, 0);
  const J: Record<string, THREE.Group> = {
    torso,
    neck: make('neck', torso, 0, 0.35, 0),
    arms: make('arms', torso, 0, 0.29, 0),
    hipL: make('hipL', body, -0.055, 0.42, 0),
    hipR: make('hipR', body, 0.055, 0.42, 0),
  };
  body.updateMatrixWorld(true);
  const parts = body.children.filter((c): c is THREE.Mesh => c instanceof THREE.Mesh);
  const box = new THREE.Box3();
  const c = new THREE.Vector3();
  for (const m of parts) {
    box.setFromObject(m);
    // 体の座標での中心
    body.worldToLocal(box.getCenter(c));
    let j = J.torso;
    if (c.y > 0.92 && Math.abs(c.x) < 0.13) j = J.neck;
    else if ((Math.abs(c.x) > 0.115 && c.y > 0.45 && c.y < 0.92) || (c.z > 0.12 && c.y > 0.6 && c.y < 0.92)) j = J.arms;
    else if (c.y < 0.4) j = c.x < 0 ? J.hipL : J.hipR;
    j.attach(m);
  }
  const all = Object.values(J);
  for (const j of all) mergeByMaterial(j, new Set(all.filter((x) => x.parent === j)));
  g.userData.joints = J;
}

/** 黒い穴のような目・口（光を返さない） */
const voidMat = () => new THREE.MeshBasicMaterial({ color: 0x020101 });

/**
 * 人の姿（おかっぱの女の子・店員・母親・石像など）。原点が足元、正面は +z。
 * skirt を省くと、背が低い子はスカート、大人はズボンになる。
 */
export function ghostFigure(opts: {
  hair: number;
  top: number;
  bottom: number;
  opacity: number;
  height?: number;
  skirt?: boolean;
  hairStyle?: 'bob' | 'short';
  /** 腕：下ろす（既定）か、胸の前で本を持つ */
  arms?: 'down' | 'book';
  /** 肌・靴下・靴の色（石像などは全部同じ色にする） */
  skin?: number;
  socks?: number;
  shoes?: number;
  /** 石像：全身を御影石の質感にし、苔をつける */
  stone?: boolean;
  /** 顔：うつろな黒い目（幽霊の既定）か、ふつうの目鼻（生身の既定） */
  face?: 'hollow' | 'plain';
  /**
   * 関節に分ける（動かす人物用）。g.userData.joints に torso・neck・arms（両腕と持ち物）・hipL・hipR が入る。
   * 脚はひざで曲がらない（石像らしく、股から棒のように振る）
   */
  rig?: boolean;
}): THREE.Group {
  const g = new THREE.Group();
  const height = opts.height ?? 1.25;
  const body = new THREE.Group();
  body.scale.setScalar(height / 1.25);
  g.add(body);
  const child = height <= 1.4;
  const skirt = opts.skirt ?? child;
  const op = opts.opacity;
  const stoneMat = (color: number, side?: THREE.Side) => tinted('statueStone', color, 0.5, { opacity: op, side, repeat: 1 });
  const cloth = (color: number, side?: THREE.Side) => (opts.stone ? stoneMat(color, side) : tinted('clothWhite', color, 0.82, { opacity: op, side }));
  const skin = opts.stone ? stoneMat(opts.skin ?? 0x7a7a72) : tinted('porcelainSkin', opts.skin ?? (op < 1 ? 0xe2dad0 : 0xc8ae98), 0.84, { opacity: op, repeat: 1, roughness: 1.6 });
  const top = cloth(opts.top);
  const bottom = cloth(opts.bottom);
  const add = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z = 0, rz = 0, rx = 0) => {
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(x, y, z);
    mesh.rotation.set(rx, 0, rz);
    body.add(mesh);
    return mesh;
  };

  // 足・脚（子どもは白い靴下）
  for (const side of [-1, 1]) {
    const x = side * 0.055;
    const shoe = add(new THREE.SphereGeometry(0.045, 14, 10), opts.stone ? stoneMat(opts.shoes ?? 0x6a6a62) : pbrMaterial('leather', { color: opts.shoes ?? 0x3a2a22, transparent: op < 1, opacity: op, roughness: 0.8 }), x, 0.025, 0.02);
    shoe.scale.set(0.85, 0.6, 1.5);
    if (skirt) {
      limb(body, V(x, 0.42, 0), V(x * 0.95, 0.06, 0.005), 0.036, 0.028, skin);
      add(new THREE.CylinderGeometry(0.033, 0.031, 0.12, 12), cloth(opts.socks ?? 0xe8e6de), x, 0.1);
    } else {
      limb(body, V(x, 0.56, 0), V(x, 0.3, 0.01), 0.05, 0.042, bottom);
      limb(body, V(x, 0.3, 0.01), V(x, 0.05, 0), 0.042, 0.036, bottom);
    }
  }
  // 腰まわり：プリーツのスカート、またはズボンの腰
  if (skirt) {
    // 点は下から上へ（面の表が外を向くように）
    const sk = lathe([
      [0.2, 0.4],
      [0.19, 0.42],
      [0.15, 0.55],
      [0.118, 0.62],
      [0.0, 0.62],
    ], 48);
    const pos = sk.getAttribute('position');
    for (let k = 0; k < pos.count; k++) {
      const vx = pos.getX(k);
      const vz = pos.getZ(k);
      const t = (0.62 - pos.getY(k)) / 0.22;
      const f = 1 + 0.07 * t * Math.abs(Math.sin(Math.atan2(vz, vx) * 12));
      pos.setXYZ(k, vx * f, pos.getY(k), vz * f);
    }
    sk.computeVertexNormals();
    add(sk, cloth(opts.bottom, THREE.DoubleSide), 0, 0);
    if (!opts.stone && child) {
      // 吊りスカートの肩ひも
      for (const side of [-1, 1]) {
        const strap = add(new THREE.BoxGeometry(0.018, 0.3, 0.006), bottom, side * 0.06, 0.76, 0.098, side * -0.05, -0.12);
        strap.scale.z = 1;
        const back = add(new THREE.BoxGeometry(0.018, 0.3, 0.006), bottom, side * 0.06, 0.76, -0.098, side * -0.05, 0.12);
        back.scale.z = 1;
      }
    }
  } else {
    add(lathe([[0.0, 0.5], [0.1, 0.5], [0.125, 0.56], [0.12, 0.64], [0.0, 0.64]]), bottom, 0, 0);
  }
  // 胴・襟・首・頭
  add(
    lathe([
      [0.0, 0.58],
      [0.112, 0.58],
      [0.124, 0.68],
      [0.135, 0.79],
      [0.13, 0.86],
      [0.1, 0.9],
      [0.035, 0.92],
      [0.0, 0.92],
    ], 32),
    top,
    0,
    0,
  ).scale.set(1, 1, 0.72);
  if (!opts.stone) {
    // 丸襟
    const collar = add(new THREE.TorusGeometry(0.042, 0.012, 6, 20, Math.PI * 1.4), top, 0, 0.915, 0.012, 0, Math.PI / 2);
    collar.rotation.z = Math.PI * 0.8;
  }
  add(new THREE.CylinderGeometry(0.029, 0.033, 0.08, 12), skin, 0, 0.94);
  // 頭と顔：幽霊はうつろな黒い目、生身の人はふつうの目
  const face = opts.face ?? (op < 1 ? 'hollow' : 'plain');
  const hC = V(0, 1.06, 0);
  const hS = V(0.93, 1.06, 0.98);
  const head = add(headGeometry(0.095, face === 'hollow' ? 0.12 : 0.07, face === 'hollow' ? 0.05 : 0.02), skin, hC.x, hC.y);
  head.scale.copy(hS);
  // 顔は球の UV のまま（投影し直すと、顔の真ん中に模様の継ぎ目が出る）
  head.userData.keepUV = true;
  for (const side of [-1, 1]) {
    if (face === 'hollow') {
      const e = add(new THREE.SphereGeometry(0.017, 12, 8), voidMat(), 0, 0);
      e.position.copy(facePoint(hC, 0.095, hS, side * 0.36, 0.1, 0.15));
      e.scale.set(1.15, 0.8, 0.5);
    } else if (!opts.stone) {
      const p = facePoint(hC, 0.095, hS, side * 0.35, 0.09, 0.1);
      const white = add(new THREE.SphereGeometry(0.0105, 12, 8), new THREE.MeshStandardMaterial({ color: 0xb8b0a4, roughness: 0.15, transparent: op < 1, opacity: op }), 0, 0);
      white.position.copy(p);
      white.scale.set(1.3, 0.75, 0.7);
      const iris = add(new THREE.SphereGeometry(0.006, 10, 8), new THREE.MeshStandardMaterial({ color: 0x0c0806, roughness: 0.1, transparent: op < 1, opacity: op }), 0, 0);
      iris.position.copy(p).add(V(0, 0, 0.0055));
    }
  }
  // 腕：半袖（上腕は服の色）と手
  for (const side of [-1, 1]) {
    if (opts.arms === 'book') {
      limb(body, V(side * 0.14, 0.87, 0), V(side * 0.16, 0.73, 0.04), 0.034, 0.03, top);
      limb(body, V(side * 0.16, 0.73, 0.04), V(side * 0.09, 0.71, 0.17), 0.026, 0.022, skin);
      add(new THREE.SphereGeometry(0.028, 10, 8), skin, side * 0.08, 0.72, 0.18).scale.set(0.7, 1, 1.1);
    } else {
      limb(body, V(side * 0.14, 0.87, 0), V(side * 0.162, 0.72, 0.005), 0.034, 0.031, top);
      limb(body, V(side * 0.162, 0.72, 0.005), V(side * 0.172, 0.53, 0.015), 0.025, 0.02, skin);
      if (opts.stone) add(new THREE.SphereGeometry(0.03, 10, 8), skin, side * 0.172, 0.49, 0.015);
      else hand(body, V(side * 0.172, 0.53, 0.015), side, skin, 0.05);
    }
  }
  // 髪
  const hairC = V(0, 1.065, -0.004);
  if (opts.stone) {
    // 石像は彫った髪（頭にかぶせた形）
    add(new THREE.SphereGeometry(0.104, 24, 14, 0, Math.PI * 2, 0, 1.3), stoneMat(opts.hair, THREE.DoubleSide), 0, 1.065).scale.set(0.97, 1.05, 1.0);
  } else {
    const hairMat = new THREE.MeshStandardMaterial({ color: opts.hair, roughness: 0.42, metalness: 0.05, side: THREE.DoubleSide, transparent: op < 1, opacity: op, depthWrite: op >= 1 });
    // 頭を髪の下地で覆ってから、房を重ねる（すき間から肌が見えないように）
    const bob = (opts.hairStyle ?? 'bob') === 'bob';
    const capMat = hairMat.clone();
    capMat.roughness = 0.85;
    add(new THREE.SphereGeometry(0.1, 24, 14, 0, Math.PI * 2, 0, 1.2), capMat, 0, 1.065, -0.004).scale.set(0.96, 1.04, 1.0);
    if (bob) add(new THREE.CylinderGeometry(0.098, 0.106, 0.1, 24, 1, true, 1.3, Math.PI * 2 - 2.6), capMat, 0, 1.04, -0.004);
    const geo = bob
      ? strandHair({
          c: hairC,
          r: 0.1,
          count: 300,
          len: () => 0.3,
          // 前髪は眉の上、横と後ろはあごの線で切りそろえる
          // 正面の眉の高さから、ほおの横をあごの高さへ、なめらかに切り下げる
          cut: (th) => {
            const t = THREE.MathUtils.smoothstep(Math.cos(th), 0.2, 0.75);
            return 0.99 + (1.092 - 0.99) * t;
          },
          width: 0.018,
          messy: 0.03,
          spread: 0.05,
        })
      : strandHair({
          c: hairC,
          r: 0.1,
          count: 220,
          len: (th) => (Math.cos(th) > 0.55 ? 0.05 : 0.08),
          cut: (th) => (Math.cos(th) > 0.55 ? 1.1 : 1.04),
          width: 0.016,
          messy: 0.15,
          spread: 0.08,
        });
    const hair = new THREE.Mesh(geo, hairMat);
    body.add(hair);
  }
  if (opts.stone) {
    // 着物：帯・打ち合わせた襟・本を持つ腕から垂れる袂
    add(new THREE.CylinderGeometry(0.128, 0.125, 0.07, 28), top, 0, 0.64).scale.z = 0.76;
    for (const side of [-1, 1]) {
      const lapel = add(new THREE.BoxGeometry(0.03, 0.2, 0.012), top, side * 0.03, 0.83, 0.098, side * 0.5, -0.1);
      lapel.position.z = 0.095;
      if (opts.arms === 'book') {
        const sleeve = add(new THREE.SphereGeometry(0.06, 14, 10), top, side * 0.15, 0.66, 0.08);
        sleeve.scale.set(0.45, 1.1, 1.0);
      }
    }
    mossOn(body, op, 7);
    weather(g, 9);
  }
  projectUVs(g, opts.stone ? 2.2 : 4);
  if (opts.rig) {
    splitJoints(g, body);
    return g;
  }
  mergeByMaterial(body);
  if (op < 1) depthPrepass(body);
  return g;
}

/** 石像についた苔の固まり（頭・肩・腰のあたりに） */
function mossOn(parent: THREE.Object3D, op: number, seed: number): void {
  const rand = rng(seed);
  const moss = pbrMaterial('moss', { repeat: 1, transparent: op < 1, opacity: op, roughness: 1 });
  const spots: [number, number, number][] = [
    [0.05, 1.15, 0.0],
    [-0.04, 1.14, -0.05],
    [0.12, 0.88, -0.02],
    [-0.13, 0.87, 0.02],
    [0.0, 0.62, -0.1],
    [0.06, 0.03, 0.06],
    [-0.07, 0.04, 0.03],
  ];
  for (const [x, y, z] of spots) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.03 + rand() * 0.025, 8, 6), moss);
    m.position.set(x, y, z);
    m.scale.set(1.2, 0.35, 1.1);
    m.rotation.set(rand() - 0.5, rand() * 3, rand() - 0.5);
    parent.add(m);
  }
}

/**
 * ザコ敵「影の子ども」：ぼろぼろの黒い服、灰色にくすんだ陶器のような肌、
 * 顔をおおう長い濡れた髪のすき間から、赤い目がのぞく。腕はひざまで届くほど長い。
 * 首・肩・ひじ・手首・指・股・ひざに関節があり、状態に合わせてぬるりと動く（rig.ts）。
 * 足もとからは黒い煙が立つ。
 */
export function shadowChild(seed = 3): THREE.Group {
  const rand = rng(seed);
  const g = new THREE.Group();
  const body = new THREE.Group();
  body.scale.setScalar(0.96);
  g.add(body);
  const skin = tinted('porcelainSkin', 0x55585e, 0.84, { opacity: 1, repeat: 1, roughness: 1.4 });
  const rag = tinted('clothWhite', 0x0b0a0d, 0.82, { opacity: 1, side: THREE.DoubleSide });
  const J: Record<string, THREE.Group> = {};
  const joint = (name: string, parent: THREE.Object3D, x: number, y: number, z: number) => {
    const j = new THREE.Group();
    j.position.set(x, y, z);
    parent.add(j);
    J[name] = j;
    return j;
  };
  const O = V(0, 0, 0);

  // 裸足のやせた脚（少し内股）。股とひざで曲がる
  for (const side of [-1, 1] as const) {
    const s = side < 0 ? 'L' : 'R';
    const hip = joint('hip' + s, body, side * 0.05, 0.5, 0);
    limb(hip, O, V(-side * 0.015, -0.23, 0.02), 0.03, 0.024, skin);
    const knee = joint('knee' + s, hip, -side * 0.015, -0.23, 0.02);
    limb(knee, O, V(side * 0.01, -0.23, -0.02), 0.024, 0.018, skin);
    const foot = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), skin);
    foot.scale.set(0.8, 0.45, 1.9);
    foot.position.set(side * 0.01, -0.25, 0.01);
    knee.add(foot);
  }

  // 上半身は腰から前に傾ける
  const torso = joint('torso', body, 0, 0.55, 0);
  torso.rotation.x = 0.14;
  // ぼろぼろのワンピース：すそはぎざぎざに裂けて垂れる
  const dress = lathe([
    [0.18, -0.24],
    [0.16, -0.12],
    [0.135, 0.0],
    [0.12, 0.12],
    [0.125, 0.25],
    [0.11, 0.33],
    [0.045, 0.39],
    [0.0, 0.4],
  ], 56);
  {
    const pos = dress.getAttribute('position');
    for (let k = 0; k < pos.count; k++) {
      const x = pos.getX(k);
      const y = pos.getY(k);
      const z = pos.getZ(k);
      const a = Math.atan2(z, x);
      const t = Math.max(0, (-0.05 - y) / 0.19);
      // すそ：裂け目で上下にばらつかせ、布のしわで半径も揺らす
      const tear = t > 0 ? (Math.abs(Math.sin(a * 7.3) * Math.sin(a * 3.1 + 1)) * 0.11 + rand() * 0.02) * t : 0;
      const f = 1 + 0.05 * Math.sin(a * 9 + y * 20) * Math.min(1, t + 0.2);
      pos.setXYZ(k, x * f, y + tear, z * f * 0.8);
    }
    dress.computeVertexNormals();
  }
  torso.add(new THREE.Mesh(dress, rag));
  // すそから垂れる裂けた布きれ
  for (let i = 0; i < 9; i++) {
    const a = rand() * Math.PI * 2;
    const len = 0.08 + rand() * 0.14;
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(0.03 + rand() * 0.03, len, 1, 3), rag);
    strip.position.set(Math.cos(a) * 0.165, -0.2 - len / 2, Math.sin(a) * 0.165 * 0.8);
    strip.rotation.set(rand() * 0.3, -a + Math.PI / 2, (rand() - 0.5) * 0.3);
    torso.add(strip);
  }
  // やせた首
  limb(torso, V(0, 0.38, 0), V(0, 0.48, 0.01), 0.022, 0.02, skin);

  // 長すぎる腕：肩・ひじ・手首で曲がり、指は付け根と先の二か所で曲がる
  const L = 0.085;
  for (const side of [-1, 1] as const) {
    const s = side < 0 ? 'L' : 'R';
    const sh = joint('sh' + s, torso, side * 0.125, 0.36, 0);
    const elAt = V(side * 0.03, -0.28, -0.025);
    limb(sh, O, elAt, 0.024, 0.019, skin);
    // 破れた袖
    limb(sh, V(0, 0.01, 0), elAt.clone().multiplyScalar(0.45), 0.04, 0.034, rag);
    const el = joint('el' + s, sh, elAt.x, elAt.y, elAt.z);
    const wrAt = V(-side * 0.005, -0.3, 0.055);
    limb(el, O, wrAt, 0.019, 0.013, skin);
    const wr = joint('wr' + s, el, wrAt.x, wrAt.y, wrAt.z);
    const palm = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), skin);
    palm.scale.set(0.55, 1.1, 0.9);
    palm.position.set(0, -0.028, 0);
    wr.add(palm);
    limb(wr, V(-side * 0.005, -0.03, 0.02), V(-side * 0.004, -0.03 - L * 0.6, 0.032), 0.007, 0.004, skin);
    const kn = joint('kn' + s, wr, side * 0.004, -0.058, 0);
    const tip = joint('tip' + s, kn, 0, -L * 0.55, 0);
    for (let i = 0; i < 4; i++) {
      const z = -0.017 + i * 0.012;
      limb(kn, V(0, 0, z), V(0, -L * 0.55, z + 0.002), 0.006, 0.0055, skin);
      limb(tip, V(0, 0, z + 0.002), V(0, -L * 0.45, z + 0.006), 0.0055, 0.0035, skin);
    }
  }

  // 頭：首の上で横にかしげる
  const neck = joint('neck', torso, 0, 0.47, 0.01);
  const headGroup = joint('head', neck, 0, 0, 0);
  const headC = V(0, 0.085, 0.005);
  const hS = V(0.9, 1.08, 0.96);
  const head = new THREE.Mesh(headGeometry(0.088, 0.16, 0.08), skin);
  head.scale.copy(hS);
  head.userData.keepUV = true;
  head.position.copy(headC);
  headGroup.add(head);
  // こけたほお、ひび割れのような黒い口
  const mouth = new THREE.Mesh(new THREE.SphereGeometry(0.018, 10, 6), voidMat());
  mouth.scale.set(1.2, 0.8, 0.35);
  mouth.position.copy(facePoint(headC, 0.088, hS, 0.03, -0.44, 0.08));
  mouth.rotation.z = 0.25;
  headGroup.add(mouth);
  // 落ちくぼんだ黒い眼窩の奥で、赤い目が光る
  const glow = new THREE.SpriteMaterial({ map: softTexture(), color: 0xff2a14, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  const pupil = new THREE.MeshBasicMaterial({ color: 0xff4a2a });
  const glows: THREE.Sprite[] = [];
  for (const side of [-1, 1]) {
    const socket = new THREE.Mesh(new THREE.SphereGeometry(0.021, 12, 8), voidMat());
    socket.scale.set(1.15, 0.85, 0.5);
    const at = facePoint(headC, 0.088, hS, side * 0.36, 0.1, 0.2);
    socket.position.copy(at);
    headGroup.add(socket);
    const p = new THREE.Mesh(new THREE.SphereGeometry(0.0065, 8, 6), pupil);
    p.position.copy(at).add(V(0, -0.002, 0.008));
    headGroup.add(p);
    const s = new THREE.Sprite(glow);
    s.position.copy(at).add(V(0, -0.002, 0.02));
    s.scale.setScalar(0.07);
    headGroup.add(s);
    glows.push(s);
  }
  // 顔の前まで垂れる、濡れた長い黒髪（頭のてっぺんを支点に、遅れて揺れる）
  const hairMat = new THREE.MeshStandardMaterial({ color: 0x050506, roughness: 0.5, metalness: 0, side: THREE.DoubleSide });
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.093, 24, 14, 0, Math.PI * 2, 0, 1.15), hairMat);
  cap.position.copy(headC);
  cap.scale.set(0.93, 1.06, 0.98);
  headGroup.add(cap);
  // 後頭部は首の近くまで黒く（うつむいて髪が垂れても、地肌が見えないように）
  const back = new THREE.Mesh(new THREE.SphereGeometry(0.092, 20, 12, Math.PI, Math.PI, 0, 2.2), hairMat);
  back.position.copy(headC);
  back.scale.set(0.93, 1.06, 0.98);
  headGroup.add(back);
  const pivot = headC.clone().add(V(0, 0.08, 0));
  const hairJ = joint('hair', headGroup, pivot.x, pivot.y, pivot.z);
  const hairGeo = strandHair({
    c: headC,
    r: 0.094,
    count: 320,
    // 正面は目の少し下まで（すき間から目がのぞく）、横と後ろは胸まで
    len: (th) => (Math.cos(th) > 0.55 ? 0.2 : 0.42),
    width: 0.013,
    messy: 0.12,
    spread: 0.05,
    seed: seed + 5,
    // 片目だけがのぞく、正面から少しずれた分け目
    part: [-0.62, 0.05],
  });
  hairGeo.translate(-pivot.x, -pivot.y, -pivot.z);
  hairJ.add(new THREE.Mesh(hairGeo, hairMat));

  // 足もとから立ちのぼる黒い煙
  const smokeMat = new THREE.SpriteMaterial({ map: softTexture(), color: 0x000000, transparent: true, opacity: 0.5, depthWrite: false });
  const smoke: { s: THREE.Sprite; m: THREE.SpriteMaterial; a: number; r: number; o: number }[] = [];
  for (let i = 0; i < 9; i++) {
    const m = smokeMat.clone();
    const s = new THREE.Sprite(m);
    g.add(s);
    smoke.push({ s, m, a: rand() * Math.PI * 2, r: 0.08 + rand() * 0.15, o: i / 9 });
  }

  projectUVs(g, 4);
  // 関節ごとに、材質ごとにまとめる（子の関節はまとめずに残す）
  const joints = Object.values(J);
  for (const j of [body, ...joints]) mergeByMaterial(j, new Set(joints.filter((c) => c.parent === j)));

  const ph = rand() * 10;
  // 髪は関節の目標ではなく、重さで垂れるように別に動かす
  const { hair: _hair, ...bodyJoints } = J;
  const qUp = new THREE.Quaternion();
  const qHead = new THREE.Quaternion();
  const qSway = new THREE.Quaternion();
  const sway = new THREE.Euler();
  g.userData.rig = makeRig(g, bodyJoints, (c) => shadowPose(c, ph), (c) => {
    const t = c.t + ph;
    // 髪：頭がどれだけ傾いても、だいたい真下へ垂れる（少しだけ頭の傾きにつられる）
    hairJ.parent!.updateWorldMatrix(true, false);
    g.getWorldQuaternion(qUp);
    hairJ.parent!.getWorldQuaternion(qHead);
    const back = c.state === 'chase' ? Math.min(1, c.speed / 1.5) * 0.25 : c.state === 'lunge' ? 0.45 : 0;
    qSway.setFromEuler(sway.set(back + 0.06 * wave(t, 0.9), 0, 0.05 * wave(t, 0.7, 2)));
    const target = qUp.clone().slerp(qHead, 0.45).multiply(qSway);
    hairJ.quaternion.copy(qHead.invert().multiply(target));
    // 浅い息
    torso.scale.set(1, 1 + Math.sin(t * 2.2) * 0.012, 1);
    // 目の光がゆらぐ
    const gl = 0.06 + 0.015 * Math.sin(t * 9) + 0.01 * Math.sin(t * 23);
    for (const s of glows) s.scale.setScalar(gl);
    for (const p of smoke) {
      const life = (t * 0.35 + p.o) % 1;
      const a = p.a + t * 0.3;
      p.s.position.set(Math.cos(a) * p.r * (1 + life), 0.05 + life * 0.55, Math.sin(a) * p.r * (1 + life));
      p.s.scale.setScalar(0.25 + life * 0.45);
      p.m.opacity = 0.55 * Math.sin(life * Math.PI);
    }
  });
  // 戦闘が始まる前（遠くにいるとき）にも、ゆらゆら動いている
  g.userData.rig.update(0.016, 'idle');
  return g;
}

/**
 * 影の子どもの姿勢。
 *   待つ：首をゆっくり回し、腕をぶらぶらさせ、ときどき片手で手招きする
 *   近づく：前かがみで顔だけ上げ、長い腕を交互に前へ伸ばして宙をかく（指はつかむように）
 *   身構え：のけぞって両腕を高く広げ、指を反らせて震わせる
 *   飛びかかり：腕を突き出し、指を鉤爪に曲げる
 *   隙・ひるみ：だらりと前に垂れ、腕が振り子のように揺れる
 */
function shadowPose(c: RigContext, ph: number): { pose: Pose; rate: number } {
  const t = c.t + ph;
  const w = (f: number, s = 0) => wave(t, f, s + ph);
  const P: Pose = {};
  const both = (name: string, f: (side: -1 | 1) => [number, number, number]) => {
    P[name + 'L'] = f(-1);
    P[name + 'R'] = f(1);
  };
  const fingers = (curlL: number, curlR: number) => {
    P.knL = [0, 0, curlL];
    P.tipL = [0, 0, curlL * 1.2];
    P.knR = [0, 0, -curlR];
    P.tipR = [0, 0, -curlR * 1.2];
  };
  let rate = 4;
  switch (c.state) {
    case 'chase': {
      const go = Math.min(1, c.speed / 1.5);
      const s = Math.sin(t * 2.4);
      P.torso = [0.5 * go + 0.1, 0.1 * w(0.6), 0.12 * Math.sin(t * 1.2)];
      P.neck = [-0.45 * go, 0.2 * w(0.5), 0.45 + 0.25 * w(0.7)];
      P.head = [-0.15, 0.15 * w(0.4, 1), 0.1 * w(0.6, 2)];
      // 宙をかくように、左右の腕を交互に前へ
      P.shL = [-1.2 - 0.45 * s * go, 0, -0.15];
      P.shR = [-1.2 + 0.45 * s * go, 0, 0.15];
      P.elL = [-0.3 - 0.3 * Math.max(0, s), 0, 0];
      P.elR = [-0.3 - 0.3 * Math.max(0, -s), 0, 0];
      both('wr', () => [-0.35, 0, 0]);
      fingers(0.45 + 0.45 * Math.sin(t * 4.8), 0.45 + 0.45 * Math.sin(t * 4.8 + 1.7));
      both('hip', (side) => [0.45 * go + 0.12 * w(1.2, side), 0, 0]);
      both('knee', (side) => [0.6 + 0.25 * w(1.4, side), 0, 0]);
      break;
    }
    case 'windup': {
      const r = ease(c.inState / 0.45);
      const tremble = 0.06 * Math.sin(t * 31) + 0.04 * Math.sin(t * 47);
      P.torso = [-0.3 * r, 0, 0.05 * w(1)];
      P.neck = [-0.75 * r, 0, 0.55];
      P.head = [-0.2 * r, 0, 0];
      both('sh', (side) => [-2.2 * r + tremble, 0, side * 0.75 * r]);
      both('el', () => [-0.6 * r, 0, 0]);
      both('wr', () => [0.55 * r + tremble, 0, 0]);
      fingers(-0.4 * r + tremble * 3, -0.4 * r - tremble * 3);
      both('hip', () => [-0.2 * r, 0, 0]);
      both('knee', () => [0.45 * r, 0, 0]);
      rate = 7;
      break;
    }
    case 'lunge':
      P.torso = [0.85, 0, 0];
      P.neck = [-0.9, 0, 0.3];
      both('sh', (side) => [-1.65, 0, side * 0.12]);
      both('el', () => [-0.05, 0, 0]);
      both('wr', () => [-0.3, 0, 0]);
      fingers(1.15, 1.15);
      both('hip', () => [0.8, 0, 0]);
      both('knee', () => [0.9, 0, 0]);
      rate = 14;
      break;
    case 'hurt':
    case 'recover':
    case 'stun': {
      // 打たれた直後は大きくのけぞり、あとはだらりと垂れる
      const recoil = c.state === 'hurt' ? 1 - ease(c.inState / 0.35) : 0;
      P.torso = [0.8 + 0.06 * w(0.8) - 1.3 * recoil, 0, 0.1 * w(0.5)];
      P.neck = [0.7 - 1.2 * recoil, 0, 0.3 + 0.15 * w(0.4)];
      both('sh', (side) => [0.15 + 0.3 * Math.sin(t * 1.6 + side), 0, side * 0.05 + 0.6 * recoil * side]);
      both('el', () => [-0.05, 0, 0]);
      fingers(0.15, 0.2);
      both('hip', () => [0.1, 0, 0]);
      both('knee', () => [0.15, 0, 0]);
      rate = c.state === 'hurt' ? 10 : 3;
      break;
    }
    case 'dying':
      P.torso = [-0.35, 0, 0];
      P.neck = [-0.9, 0, 0.8];
      both('sh', (side) => [-2.8, 0, side * 0.3]);
      both('el', () => [-0.2, 0, 0]);
      fingers(-0.4, -0.4);
      rate = 3;
      break;
    default: {
      // 待つ：ゆっくり首を回し、ときどき右手で手招きする
      const cyc = (t % 11) / 11;
      const beck = ease((cyc - 0.55) / 0.1) * (1 - ease((cyc - 0.88) / 0.08));
      P.torso = [0.05 * w(0.6), 0.08 * w(0.25), 0.05 * w(0.35)];
      P.neck = [0.12 + 0.15 * w(0.21), 0.1 * w(0.15), 0.42 + 0.3 * w(0.27)];
      P.head = [0.05 * w(0.3), 0.25 * w(0.18), 0.1 * w(0.4)];
      P.shL = [0.08 * w(0.7, 1), 0, -0.08 + 0.05 * w(0.5)];
      P.shR = [0.08 * w(0.7, 2) - 1.05 * beck, 0, 0.08 + 0.05 * w(0.5, 3)];
      P.elL = [-0.1 - 0.08 * w(0.6), 0, 0];
      P.elR = [-0.1 - 0.65 * beck, 0, 0];
      P.wrL = [0.1 * w(0.8), 0, 0];
      P.wrR = [0.1 * w(0.8, 1) - 0.3 * beck, 0, 0];
      fingers(0.35 + 0.3 * w(1.1), 0.35 + 0.3 * w(1.1, 2) + beck * (0.35 + 0.45 * Math.sin(t * 4.5)));
      both('hip', (side) => [0.05 * w(0.5, side), 0, 0]);
      both('knee', (side) => [0.1 + 0.05 * w(0.6, side), 0, 0]);
    }
  }
  return { pose: P, rate };
}

/**
 * 人体模型。原点が台座の中心、正面は +z。体の左半分（-x）はてかてかした肌、
 * 右半分（+x）は皮をはいだ筋肉と内臓・むき出しの目玉と歯。heart は胸の心臓（別に表示を切り替える）
 */
export function anatomyModel(b: WorldBuilder): { root: THREE.Group; heart: THREE.Mesh; keyInHand: THREE.Mesh } {
  const root = new THREE.Group();
  // 古い樹脂の肌：黄ばんで、てかりがある
  const skin = tinted('porcelainSkin', 0xc09a78, 0.84, { opacity: 1, roughness: 0.9 });
  const muscle = new THREE.MeshStandardMaterial({ map: muscleTexture(), roughness: 0.32, metalness: 0, color: 0xd8c8c0 });
  const organ = (color: number) => new THREE.MeshStandardMaterial({ color, roughness: 0.25, metalness: 0 });
  const L = Math.PI; // 左半分の lathe：phi = π〜2π が -x 側
  const half = (pts: [number, number][], left: boolean, sz = 0.65) => {
    const m = new THREE.Mesh(lathe(pts, 16, left ? L : 0, Math.PI), left ? skin : muscle);
    m.scale.z = sz;
    root.add(m);
    return m;
  };

  // 台座と支柱
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.26, 0.05, 28), b.mat('metalGray'));
  base.position.y = 0.025;
  root.add(base);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.9, 8), b.mat('metal'));
  pole.position.set(0, 0.5, -0.12);
  root.add(pole);

  // 脚
  for (const side of [-1, 1]) {
    const m = side < 0 ? skin : muscle;
    const x = side * 0.08;
    limb(root, V(x, 0.93, 0), V(x * 1.05, 0.5, 0.01), 0.068, 0.048, m);
    limb(root, V(x * 1.05, 0.5, 0.01), V(x, 0.1, -0.005), 0.048, 0.034, m);
    const foot = new THREE.Mesh(new THREE.SphereGeometry(0.04, 12, 8), m);
    foot.scale.set(0.9, 0.55, 2.0);
    foot.position.set(x, 0.07, 0.04);
    root.add(foot);
  }
  // 胴（腰から肩まで）：左右で別の材質
  const torso: [number, number][] = [
    [0.0, 0.86],
    [0.14, 0.87],
    [0.165, 0.95],
    [0.15, 1.07],
    [0.15, 1.2],
    [0.18, 1.34],
    [0.19, 1.41],
    [0.13, 1.47],
    [0.05, 1.5],
    [0.0, 1.5],
  ];
  half(torso, true);
  half(torso, false);
  // 筋肉側の肋骨・腸
  const ribMat = organ(0xe8dcc4);
  for (let i = 0; i < 5; i++) {
    const rib = new THREE.Mesh(new THREE.TorusGeometry(0.15 - i * 0.004, 0.006, 5, 14, Math.PI * 0.42), ribMat);
    rib.rotation.set(Math.PI / 2 + 0.15, 0, 0.1);
    rib.scale.set(1, 0.68, 1);
    rib.position.set(0.0, 1.36 - i * 0.045, 0);
    root.add(rib);
  }
  const gut = new THREE.CatmullRomCurve3(
    [
      [0.02, 1.12], [0.11, 1.12], [0.12, 1.07], [0.03, 1.06], [0.02, 1.01], [0.12, 1.0], [0.11, 0.95], [0.03, 0.95], [0.05, 0.91],
    ].map(([x, y]) => V(x, y, 0.08 + Math.sin(x * 40) * 0.006)),
  );
  root.add(new THREE.Mesh(new THREE.TubeGeometry(gut, 80, 0.017, 8), organ(0xc07a70)));
  const liver = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 8), organ(0x5a1c18));
  liver.scale.set(1.3, 0.6, 0.6);
  liver.position.set(0.07, 1.18, 0.075);
  root.add(liver);
  // 心臓をはめる穴
  const hole = new THREE.Mesh(new THREE.CircleGeometry(0.048, 16), voidMat());
  hole.position.set(-0.05, 1.3, 0.118);
  root.add(hole);
  // 首・頭
  limb(root, V(0, 1.48, 0), V(0, 1.57, 0.005), 0.045, 0.042, skin);
  const headL = new THREE.Mesh(new THREE.SphereGeometry(0.105, 20, 16, -Math.PI / 2, Math.PI), skin);
  const headR = new THREE.Mesh(new THREE.SphereGeometry(0.105, 20, 16, Math.PI / 2, Math.PI), muscle);
  for (const h of [headL, headR]) {
    h.position.set(0, 1.66, 0);
    h.scale.set(0.82, 1.1, 0.95);
    root.add(h);
  }
  // 目：肌側は小さなガラスの目、筋肉側はまぶたのない大きな目玉
  const white = organ(0xf2ece0);
  const iris = new THREE.MeshStandardMaterial({ color: 0x2a3a30, roughness: 0.1 });
  const eye = (x: number, r: number, z: number) => {
    const e = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 10), white);
    e.position.set(x, 1.675, z);
    root.add(e);
    const i = new THREE.Mesh(new THREE.CircleGeometry(r * 0.45, 12), iris);
    i.position.set(x, 1.675, z + r * 0.98);
    root.add(i);
    const p = new THREE.Mesh(new THREE.CircleGeometry(r * 0.2, 10), voidMat());
    p.position.set(x, 1.675, z + r * 0.99 + 0.0005);
    root.add(p);
  };
  eye(-0.038, 0.014, 0.088);
  eye(0.038, 0.021, 0.085);
  // 筋肉側：唇のない歯ぐき
  const teeth = organ(0xe8e0c8);
  for (let i = 0; i < 5; i++) {
    const tth = new THREE.Mesh(new THREE.BoxGeometry(0.009, 0.013, 0.006), teeth);
    tth.position.set(0.006 + i * 0.01, 1.6, 0.093 - i * 0.004);
    tth.rotation.y = i * 0.12;
    root.add(tth);
  }
  // 肌側の耳
  const ear = new THREE.Mesh(new THREE.SphereGeometry(0.022, 10, 8), skin);
  ear.scale.set(0.4, 1.2, 0.8);
  ear.position.set(-0.088, 1.67, -0.005);
  root.add(ear);
  // 腕（右手に鍵を握る）
  for (const side of [-1, 1]) {
    const m = side < 0 ? skin : muscle;
    const sh = V(side * 0.19, 1.4, 0);
    const el = V(side * 0.23, 1.12, -0.01);
    const wr = V(side * 0.22, 0.86, 0.04);
    limb(root, sh, el, 0.045, 0.036, m);
    limb(root, el, wr, 0.036, 0.026, m);
    hand(root, wr, side, m, 0.07);
  }
  const heart = new THREE.Mesh(new THREE.SphereGeometry(0.05, 14, 10), organ(0x8a1414));
  heart.scale.set(1, 1.2, 0.8);
  heart.position.set(-0.05, 1.3, 0.1);
  root.add(heart);
  const keyInHand = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.1, 0.03), new THREE.MeshStandardMaterial({ color: 0xc9a54a, emissive: 0x3a2a08, metalness: 0.8, roughness: 0.35 }));
  keyInHand.position.set(0.22, 0.78, 0.05);
  root.add(keyInHand);
  // 肌側は写真の質感（細かいひびの入った古い樹脂）を貼り直す。筋肉は繊維の向きのまま
  root.traverse((o) => {
    if (o instanceof THREE.Mesh && o.material === muscle) o.userData.keepUV = true;
  });
  projectUVs(root, 3);
  mergeByMaterial(root, new Set<THREE.Object3D>([heart, keyInHand]));
  root.add(b.hitShape([0.55, 1.8, 0.5], [0, 0.9, 0]));
  return { root, heart, keyInHand };
}
