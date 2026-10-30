import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/*
 * 人の体：MakeHuman の基本メッシュ（CC0）に骨とウェイトを付けたモデル（public/models/human.gltf.json）から、
 * 体つき（子ども・大人・やせ細った化け物）を変えて、骨で動く人物を作る。
 *
 * 体つきの変え方：骨ごとに「長さ」と「太さ」の倍率を決め、その骨に付いた頂点を、
 * 骨の付け根を中心に骨の向きへ伸ばし、横へ縮める（ウェイトで混ぜる）。子の骨の付け根も一緒に動く。
 */

/** モデルの骨の名前（左右は MakeHuman と同じく、.L が体の左＝ +x 側） */
export type BoneName =
  | 'hips'
  | 'spine'
  | 'chest'
  | 'neck'
  | 'head'
  | `${'clavicle' | 'upperarm' | 'lowerarm' | 'hand' | 'thumb' | 'fingers' | 'fingertips' | 'upperleg' | 'lowerleg' | 'foot'}_${'L' | 'R'}`;

/** 骨ごとの長さ・太さの倍率（指定しない骨は 1） */
export interface Build {
  height: number;
  [bone: string]: [number, number] | number;
}

const sym = (o: Record<string, [number, number]>) => {
  const out: Record<string, [number, number]> = {};
  for (const [k, v] of Object.entries(o)) {
    if (k.endsWith('_')) {
      out[k + 'L'] = v;
      out[k + 'R'] = v;
    } else out[k] = v;
  }
  return out;
};

/** 体つき */
export const BUILDS: Record<string, Build> = {
  // 大人（中肉中背）
  adult: { height: 1.68 },
  // 子ども：頭が大きく、手足が短い
  child: { height: 1.25, ...sym({ head: [1.22, 1.22], neck: [0.85, 0.9], chest: [0.9, 0.88], spine: [0.95, 0.88], hips: [1, 0.9], upperarm_: [0.92, 0.85], lowerarm_: [0.92, 0.85], upperleg_: [0.9, 0.85], lowerleg_: [0.9, 0.85] }) },
  // 化け物：骨と皮にやせ細り、首と腕と指が異様に長い
  creature: {
    height: 1.32,
    ...sym({
      head: [1.12, 1.08],
      neck: [1.5, 0.62],
      chest: [0.95, 0.74],
      spine: [1.05, 0.66],
      hips: [1, 0.72],
      clavicle_: [1.1, 0.7],
      upperarm_: [1.3, 0.52],
      lowerarm_: [1.35, 0.5],
      hand_: [1.25, 0.8],
      fingers_: [1.6, 0.68],
      fingertips_: [1.75, 0.62],
      thumb_: [1.4, 0.7],
      upperleg_: [1.0, 0.5],
      lowerleg_: [1.05, 0.48],
      foot_: [1.05, 0.75],
    }),
  },
};

interface Source {
  bones: { name: string; parent: string | null; head: THREE.Vector3 }[];
  tails: Record<string, THREE.Vector3>;
  prims: Map<string, THREE.BufferGeometry>;
}

let source: Source | null = null;

/** 読み込んだモデル（ModelLibrary の human）を渡す。無ければ人物は今までの形で作る */
export function setHumanSource(scene: THREE.Object3D | null): void {
  source = null;
  if (!scene) return;
  scene.updateMatrixWorld(true);
  const extras = scene.userData.extras as { tails?: Record<string, number[]> } | null;
  let skinned: THREE.SkinnedMesh | null = null;
  const prims = new Map<string, THREE.BufferGeometry>();
  scene.traverse((o) => {
    if (o instanceof THREE.SkinnedMesh) {
      skinned ??= o;
      prims.set(o.name, o.geometry as THREE.BufferGeometry);
    }
  });
  if (!skinned || !extras?.tails) return;
  const bones = (skinned as THREE.SkinnedMesh).skeleton.bones.map((b) => ({
    name: b.name,
    parent: b.parent instanceof THREE.Bone ? b.parent.name : null,
    head: b.getWorldPosition(new THREE.Vector3()),
  }));
  const tails: Record<string, THREE.Vector3> = {};
  for (const [k, v] of Object.entries(extras.tails)) tails[k] = new THREE.Vector3(v[0], v[1], v[2]);
  source = { bones, tails, prims };
}

export function hasHuman(): boolean {
  return source !== null;
}

/** 体つきを変えた形（同じ体つきは使い回す） */
interface Variant {
  heads: Map<string, THREE.Vector3>;
  prims: Map<string, THREE.BufferGeometry>;
}
const variants = new Map<string, Variant>();

function makeVariant(key: string): Variant {
  const cached = variants.get(key);
  if (cached) return cached;
  const src = source!;
  const build = BUILDS[key];
  // 骨ごとの変形（付け根を中心に、骨の向きへ長さ倍・横へ太さ倍）を、親から順に決める
  const mats = new Map<string, THREE.Matrix4>();
  const heads = new Map<string, THREE.Vector3>();
  for (const b of src.bones) {
    const shape = build[b.name];
    const [L, R] = Array.isArray(shape) ? shape : [1, 1];
    const parentM = b.parent ? mats.get(b.parent)! : new THREE.Matrix4();
    const h = b.head.clone();
    const h2 = h.clone().applyMatrix4(parentM);
    const a = src.tails[b.name].clone().sub(h).normalize();
    // S = R·I + (L − R)·a aᵀ
    const S = new THREE.Matrix4().set(
      R + (L - R) * a.x * a.x, (L - R) * a.x * a.y, (L - R) * a.x * a.z, 0,
      (L - R) * a.y * a.x, R + (L - R) * a.y * a.y, (L - R) * a.y * a.z, 0,
      (L - R) * a.z * a.x, (L - R) * a.z * a.y, R + (L - R) * a.z * a.z, 0,
      0, 0, 0, 1,
    );
    const M = new THREE.Matrix4().makeTranslation(h2.x, h2.y, h2.z).multiply(S).multiply(new THREE.Matrix4().makeTranslation(-h.x, -h.y, -h.z));
    mats.set(b.name, M);
    heads.set(b.name, h2);
  }
  const index = src.bones.map((b) => mats.get(b.name)!);
  const normalMats = index.map((m) => new THREE.Matrix3().getNormalMatrix(m));
  // 頂点をウェイトで混ぜて動かし、最後に身長をそろえる
  const prims = new Map<string, THREE.BufferGeometry>();
  let minY = Infinity;
  let maxY = -Infinity;
  const p = new THREE.Vector3();
  const n = new THREE.Vector3();
  const acc = new THREE.Vector3();
  const accN = new THREE.Vector3();
  for (const [name, base] of src.prims) {
    const pos = base.getAttribute('position');
    const nor = base.getAttribute('normal');
    const uv = base.getAttribute('uv');
    const si = base.getAttribute('skinIndex');
    const sw = base.getAttribute('skinWeight');
    const P = new Float32Array(pos.count * 3);
    const Nn = new Float32Array(pos.count * 3);
    const U = new Float32Array(pos.count * 2);
    const W = new Float32Array(pos.count * 4);
    const I = new Uint16Array(pos.count * 4);
    for (let i = 0; i < pos.count; i++) {
      acc.set(0, 0, 0);
      accN.set(0, 0, 0);
      for (let k = 0; k < 4; k++) {
        const w = sw.getComponent(i, k);
        const j = si.getComponent(i, k);
        W[i * 4 + k] = w;
        I[i * 4 + k] = j;
        if (w <= 0) continue;
        acc.addScaledVector(p.fromBufferAttribute(pos, i).applyMatrix4(index[j]), w);
        accN.addScaledVector(n.fromBufferAttribute(nor, i).applyMatrix3(normalMats[j]), w);
      }
      accN.normalize();
      P.set([acc.x, acc.y, acc.z], i * 3);
      Nn.set([accN.x, accN.y, accN.z], i * 3);
      U[i * 2] = uv.getX(i);
      U[i * 2 + 1] = uv.getY(i);
      if (name.startsWith('body_foot')) minY = Math.min(minY, acc.y);
      if (name === 'body_head') maxY = Math.max(maxY, acc.y);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(P, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(Nn, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(U, 2));
    g.setAttribute('skinIndex', new THREE.BufferAttribute(I, 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(W, 4));
    g.setIndex(base.getIndex()!.clone());
    prims.set(name, g);
  }
  const k = build.height / (maxY - minY);
  const shift = -minY;
  const fit = new THREE.Matrix4().makeScale(k, k, k).multiply(new THREE.Matrix4().makeTranslation(0, shift, 0));
  for (const g of prims.values()) g.applyMatrix4(fit);
  for (const h of heads.values()) h.applyMatrix4(fit);
  const v = { heads, prims };
  variants.set(key, v);
  return v;
}

export interface Outfit {
  /** 材質ごとに、使う部位（例：skin に body_head, body_hand …） */
  /** cut：三角形の重心を受け取り、残すなら true（スカートの丈・ぼろぼろの裾など） */
  parts: { material: THREE.Material; prims: string[]; cut?: (p: THREE.Vector3) => boolean; shape?: (p: THREE.Vector3) => void }[];
}

export interface Human {
  /** 足もとが原点の入れ物（これを動かすと体ごと動く） */
  root: THREE.Group;
  bones: Record<string, THREE.Bone>;
  /** 骨の休みの姿勢での、子の骨までの向き（IK に使う） */
  rest: (bone: string) => THREE.Vector3;
  /** 頭の骨から見た、頭蓋の中心と半径（髪を付けるため） */
  skull: { center: THREE.Vector3; radius: number };
  /** 目の位置（頭の骨から見た） */
  eyes: THREE.Vector3[];
  height: number;
}

const merged = new Map<string, THREE.BufferGeometry>();

/** 人を作る。outfit で部位ごとの材質を決める（入っていない部位は描かない） */
export function makeHuman(build: string, outfit: Outfit, cacheKey: string): Human {
  const v = makeVariant(build);
  const src = source!;
  const root = new THREE.Group();
  const bones: Record<string, THREE.Bone> = {};
  const list: THREE.Bone[] = [];
  for (const b of src.bones) {
    const bone = new THREE.Bone();
    bone.name = b.name;
    const h = v.heads.get(b.name)!;
    const ph = b.parent ? v.heads.get(b.parent)! : new THREE.Vector3();
    bone.position.copy(h).sub(ph);
    (b.parent ? bones[b.parent] : root).add(bone);
    bones[b.name] = bone;
    list.push(bone);
  }
  root.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(list);
  skeleton.calculateInverses();
  outfit.parts.forEach((part, i) => {
    const key = `${build}|${cacheKey}|${i}`;
    let geo = merged.get(key);
    if (!geo) {
      const geos = part.prims.map((n) => v.prims.get(n)).filter((g): g is THREE.BufferGeometry => !!g);
      if (!geos.length) return;
      geo = mergeGeometries(geos, false)!;
      if (part.cut) geo = cutTriangles(geo, part.cut);
      if (part.shape) {
        // 形を変える（スカートの丈を縮める・広げるなど）
        geo = geo.clone();
        const pos = geo.getAttribute('position');
        const t = new THREE.Vector3();
        for (let k = 0; k < pos.count; k++) {
          part.shape(t.fromBufferAttribute(pos, k));
          pos.setXYZ(k, t.x, t.y, t.z);
        }
        geo.computeVertexNormals();
      }
      geo.computeBoundingSphere();
      merged.set(key, geo);
    }
    const mesh = new THREE.SkinnedMesh(geo, part.material);
    mesh.bind(skeleton, new THREE.Matrix4());
    // 体の外へ動いても消えないように（骨で動くと、元の形の境界からはみ出す）
    mesh.frustumCulled = false;
    root.add(mesh);
  });
  // 頭蓋：頭の骨に付いた頂点の範囲から
  const headGeo = v.prims.get('body_head')!;
  const hp = headGeo.getAttribute('position');
  const box = new THREE.Box3();
  const t = new THREE.Vector3();
  const headTop = v.heads.get('head')!;
  for (let i = 0; i < hp.count; i++) {
    t.fromBufferAttribute(hp, i);
    if (t.y > headTop.y) box.expandByPoint(t);
  }
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const radius = Math.max(size.x, size.z) / 2;
  center.y = box.max.y - radius;
  const eyesGeo = v.prims.get('eyes');
  const eyes: THREE.Vector3[] = [];
  if (eyesGeo) {
    const ep = eyesGeo.getAttribute('position');
    const l = new THREE.Vector3();
    const r = new THREE.Vector3();
    let nl = 0;
    let nr = 0;
    for (let i = 0; i < ep.count; i++) {
      t.fromBufferAttribute(ep, i);
      if (t.x > 0) {
        l.add(t);
        nl++;
      } else {
        r.add(t);
        nr++;
      }
    }
    eyes.push(r.divideScalar(Math.max(nr, 1)).sub(headTop), l.divideScalar(Math.max(nl, 1)).sub(headTop));
  }
  return {
    root,
    bones,
    rest: (name) => {
      const kid = Object.values(bones).find((b) => b.parent === bones[name] && !b.name.startsWith('thumb'));
      return kid ? kid.position.clone() : new THREE.Vector3(0, -0.05, 0);
    },
    skull: { center: center.sub(headTop), radius },
    eyes,
    height: BUILDS[build].height,
  };
}

/** 条件に合わない三角形を取り除く（スカートの丈など） */
function cutTriangles(geo: THREE.BufferGeometry, keep: (p: THREE.Vector3) => boolean): THREE.BufferGeometry {
  const idx = geo.getIndex()!;
  const pos = geo.getAttribute('position');
  const out: number[] = [];
  const c = new THREE.Vector3();
  const t = new THREE.Vector3();
  for (let i = 0; i < idx.count; i += 3) {
    c.set(0, 0, 0);
    for (let k = 0; k < 3; k++) c.add(t.fromBufferAttribute(pos, idx.getX(i + k)));
    if (keep(c.divideScalar(3))) out.push(idx.getX(i), idx.getX(i + 1), idx.getX(i + 2));
  }
  const g = geo.clone();
  g.setIndex(out);
  return g;
}

/**
 * 腕を自然に下ろす（モデルは腕を斜めに広げた形なので）。out は外への開き、fwd は前への出し方（ラジアン）
 */
export function relaxArms(h: Human, out = 0.12, fwd = 0.08, bend = 0.25): void {
  for (const s of ['L', 'R'] as const) {
    const sign = s === 'L' ? 1 : -1;
    const up = h.bones[`upperarm_${s}`];
    const low = h.bones[`lowerarm_${s}`];
    const dir = h.rest(`upperarm_${s}`).normalize();
    const want = new THREE.Vector3(sign * Math.sin(out), -Math.cos(out), Math.sin(fwd)).normalize();
    up.quaternion.setFromUnitVectors(dir, want);
    // ひじを少し曲げる（前へ）
    low.rotation.set(-bend, 0, 0);
  }
}
