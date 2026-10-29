import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CollisionWorld } from '../engine/collision';
import type { ModelLibrary } from '../engine/models';

/**
 * Box / Plane を並べてステージを組み立てるためのヘルパー。
 * 動かない物は材質ごとに 1 つのジオメトリへ結合して描画負荷を下げる。
 * 動く物・調べられる物は個別の Mesh として返す。
 */

export interface MaterialDef {
  material: THREE.Material;
  /** テクスチャ 1 枚が覆う大きさ（m）。world UV の計算に使う */
  texW?: number;
  texH?: number;
}

export interface Opening {
  from: number;
  to: number;
  /** 下端（0 なら床まで＝通れる） */
  bottom?: number;
  /** 上端 */
  top: number;
}

export type Vec3 = [number, number, number];

/** 枠・幅木を付ける壁の材質（建物の中の壁） */
const TRIMMED = new Set(['wall', 'tile', 'homeWall', 'plaster', 'storeWall']);

/** 開閉する物（個室の扉など）。open アクションで回転・スライドさせる */
export interface Openable {
  pivot: THREE.Object3D;
  /** 開いたときの Y 回転 */
  openRotY: number;
  /** 開いたときの移動量（引き戸） */
  slide: Vec3;
  basePos: THREE.Vector3;
  /** 開いたら無効にする当たり判定のタグ */
  colliderTag?: string;
  progress: number;
  opening: boolean;
  /** 開け閉めにかかる秒数（省略時 1.4 秒） */
  seconds?: number;
  /** 勝手に開け閉めする演出の残り時間など */
  rattleLeft: number;
  rattleTimer: number;
  /** 演出中の開き具合（0..1）と、その目標 */
  rattleAmount: number;
  rattleTarget: number;
}

export class WorldBuilder {
  readonly root = new THREE.Group();
  /** 名前付きの物（調べられる物・扉など） */
  readonly named = new Map<string, THREE.Object3D>();
  /** 視線の遮蔽に使う静的メッシュ */
  readonly occluders: THREE.Object3D[] = [];
  /** 照準で調べられる物（userData.interactId を持つ） */
  readonly pickables: THREE.Object3D[] = [];
  readonly openables = new Map<string, Openable>();
  /** teleport で使う地点 */
  readonly spawns = new Map<string, { x: number; z: number; yaw: number }>();
  /** 毎フレーム呼ばれる見た目の動き（光る目印など）。引数は経過秒 */
  readonly animations: ((time: number) => void)[] = [];
  private pending = new Map<string, THREE.BufferGeometry[]>();
  private pendingMat = new Map<THREE.Material, THREE.BufferGeometry[]>();
  /** 外部モデル（ないときは各部品が箱で代わりを作る） */
  models: ModelLibrary | null = null;
  /** 同じモデルを何度も置くときは、部品ごとにまとめて 1 回で描く */
  private instances = new Map<string, { geometry: THREE.BufferGeometry; material: THREE.Material; matrices: THREE.Matrix4[] }>();
  private hitMat = new THREE.MeshBasicMaterial({ visible: false });

  constructor(
    readonly scene: THREE.Scene,
    readonly collision: CollisionWorld,
    readonly materials: Record<string, MaterialDef>,
  ) {
    scene.add(this.root);
  }

  mat(key: string): THREE.Material {
    const m = this.materials[key];
    if (!m) throw new Error(`unknown material: ${key}`);
    return m.material;
  }

  /** 静的な直方体。collide=true で当たり判定も作る */
  box(min: Vec3, max: Vec3, matKey: string, opts: { collide?: boolean } = {}): void {
    const geo = boxGeometry(min, max);
    this.applyWorldUV(geo, matKey);
    this.queue(matKey, geo);
    if (opts.collide) this.collision.add(min[0], min[2], max[0], max[2]);
  }

  /** 静的な任意の形（円柱・回転体など）。ワールド座標で置いた geometry を、材質ごとにまとめて描く */
  mesh(geo: THREE.BufferGeometry, matKey: string): void {
    this.applyWorldUV(geo, matKey);
    this.queue(matKey, geo);
  }

  /**
   * 動かさない飾りのメッシュ（独自の材質のもの）。位置・回転・大きさを形に焼き込み、
   * 同じ材質どうしを最後に 1 つにまとめる
   */
  staticMesh(mesh: THREE.Mesh): void {
    mesh.updateMatrix();
    let geo = (mesh.geometry as THREE.BufferGeometry).clone().applyMatrix4(mesh.matrix);
    if (geo.index) geo = geo.toNonIndexed();
    for (const name of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(name)) geo.deleteAttribute(name);
    if (!geo.getAttribute('uv')) geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(geo.getAttribute('position').count * 2), 2));
    const mat = mesh.material as THREE.Material;
    const list = this.pendingMat.get(mat) ?? [];
    list.push(geo);
    this.pendingMat.set(mat, list);
    mesh.geometry.dispose();
  }

  /** 個別に動かせる直方体（原点 = pivot）。親グループに入れて返す */
  dynamicBox(size: Vec3, offset: Vec3, matKey: string | THREE.Material): THREE.Mesh {
    const geo = new THREE.BoxGeometry(size[0], size[1], size[2]);
    geo.translate(offset[0], offset[1], offset[2]);
    if (typeof matKey === 'string') {
      const def = this.materials[matKey];
      const w = def?.texW ?? size[0];
      const h = def?.texH ?? size[1];
      scaleBoxUV(geo, size, w, h);
    }
    const mesh = new THREE.Mesh(geo, typeof matKey === 'string' ? this.mat(matKey) : matKey);
    return mesh;
  }

  /**
   * 外部モデルを置く（動かない物）。rot は [x, y, z]（y を先に回す）か y だけ。
   * モデルがなければ何もせず false を返すので、呼び出し側が箱で代わりを作る。
   */
  prop(name: string, pos: Vec3, rot: Vec3 | number = 0, scale: number | Vec3 = 1): boolean {
    const parts = this.models?.parts(name);
    if (!parts) return false;
    const r = typeof rot === 'number' ? [0, rot, 0] : rot;
    const s = typeof scale === 'number' ? [scale, scale, scale] : scale;
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(pos[0], pos[1], pos[2]),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(r[0], r[1], r[2], 'YXZ')),
      new THREE.Vector3(s[0], s[1], s[2]),
    );
    parts.forEach((p, i) => {
      const key = `${name}#${i}`;
      let entry = this.instances.get(key);
      if (!entry) {
        entry = { geometry: p.geometry, material: p.material, matrices: [] };
        this.instances.set(key, entry);
      }
      entry.matrices.push(m.clone().multiply(p.matrix));
    });
    return true;
  }

  /** 外部モデルの複製（動かす物・調べられる物の見た目に）。なければ null */
  propObject(name: string): THREE.Object3D | null {
    const root = this.models?.get(name);
    return root ? root.clone(true) : null;
  }

  /** 水平な面（床・天井）。up=false で下向き */
  plane(x1: number, z1: number, x2: number, z2: number, y: number, matKey: string, up = true): void {
    const geo = new THREE.PlaneGeometry(Math.abs(x2 - x1), Math.abs(z2 - z1));
    geo.rotateX(up ? -Math.PI / 2 : Math.PI / 2);
    geo.translate((x1 + x2) / 2, y, (z1 + z2) / 2);
    this.applyWorldUV(geo, matKey);
    this.queue(matKey, geo);
  }

  /**
   * X 軸方向に伸びる壁（z 固定）。openings で扉・窓の穴をあける。
   * 当たり判定は「床まで開いた穴」以外すべてに付く。
   */
  wallX(z: number, x1: number, x2: number, matKey: string, openings: Opening[] = [], h = 3, t = 0.2): void {
    this.wall('x', z, x1, x2, matKey, openings, h, t);
  }

  /** Z 軸方向に伸びる壁（x 固定） */
  wallZ(x: number, z1: number, z2: number, matKey: string, openings: Opening[] = [], h = 3, t = 0.2): void {
    this.wall('z', x, z1, z2, matKey, openings, h, t);
  }

  private wall(axis: 'x' | 'z', fixed: number, a1: number, a2: number, matKey: string, openings: Opening[], h: number, t: number): void {
    const lo = Math.min(a1, a2);
    const hi = Math.max(a1, a2);
    const ops = [...openings].sort((p, q) => p.from - q.from);
    const seg = (s: number, e: number, y1: number, y2: number, collide: boolean) => {
      if (e - s <= 1e-4 || y2 - y1 <= 1e-4) return;
      if (axis === 'x') this.box([s, y1, fixed - t / 2], [e, y2, fixed + t / 2], matKey, { collide });
      else this.box([fixed - t / 2, y1, s], [fixed + t / 2, y2, e], matKey, { collide });
    };
    let cursor = lo;
    for (const o of ops) {
      seg(cursor, o.from, 0, h, true);
      const bottom = o.bottom ?? 0;
      if (bottom > 0) seg(o.from, o.to, 0, bottom, true);
      seg(o.from, o.to, o.top, h, false);
      if (bottom > 0) {
        // 窓は通れない
        if (axis === 'x') this.collision.add(o.from, fixed - t / 2, o.to, fixed + t / 2);
        else this.collision.add(fixed - t / 2, o.from, fixed + t / 2, o.to);
      }
      cursor = o.to;
    }
    seg(cursor, hi, 0, h, true);
    this.trim(axis, fixed, lo, hi, matKey, ops, h, t);
  }

  /**
   * 壁の見切り：扉・窓のまわりの枠（両面）と、開口部の内側の枠、床ぎわの幅木。
   * 平らな壁に穴があいただけ、に見えないようにする。
   */
  private trim(axis: 'x' | 'z', fixed: number, lo: number, hi: number, matKey: string, ops: Opening[], h: number, t: number): void {
    if (!TRIMMED.has(matKey) || !this.materials.frame) return;
    const cw = 0.06; // 枠の見付け
    const cd = 0.018; // 壁から出る厚み
    const put = (a1: number, a2: number, y1: number, y2: number, d1: number, d2: number, mat: string) => {
      if (a2 - a1 <= 1e-4 || y2 - y1 <= 1e-4) return;
      if (axis === 'x') this.box([a1, y1, fixed + d1], [a2, y2, fixed + d2], mat);
      else this.box([fixed + d1, y1, a1], [fixed + d2, y2, a2], mat);
    };
    for (const o of ops) {
      if (o.to - o.from > 3) continue; // 昇降口のような大きな開口は枠なし
      const bottom = o.bottom ?? 0;
      const a1 = Math.max(lo, o.from - cw);
      const a2 = Math.min(hi, o.to + cw);
      const top = Math.min(h, o.top + cw);
      for (const side of [-1, 1]) {
        const f = (side * t) / 2;
        const d1 = side < 0 ? f - cd : f;
        const d2 = side < 0 ? f : f + cd;
        put(a1, o.from, bottom > 0 ? bottom - cw : 0, top, d1, d2, 'frame');
        put(o.to, a2, bottom > 0 ? bottom - cw : 0, top, d1, d2, 'frame');
        put(a1, a2, o.top, top, d1, d2, 'frame');
        if (bottom > 0) put(a1, a2, bottom - cw, bottom, d1, d2, 'frame');
      }
      // 開口部の内側（壁の厚みの部分）も枠で包む
      put(o.from, o.from + 0.02, bottom, o.top, -t / 2, t / 2, 'frame');
      put(o.to - 0.02, o.to, bottom, o.top, -t / 2, t / 2, 'frame');
      put(o.from, o.to, o.top - 0.02, o.top, -t / 2, t / 2, 'frame');
      if (bottom > 0) put(o.from, o.to, bottom, bottom + 0.02, -t / 2, t / 2, 'frame');
    }
    // 幅木：床まで届く壁の区間に、両面とも
    if (!this.materials.skirting) return;
    let cursor = lo;
    const spans: [number, number][] = [];
    for (const o of ops) {
      if ((o.bottom ?? 0) === 0) {
        spans.push([cursor, o.from]);
        cursor = o.to;
      }
    }
    spans.push([cursor, hi]);
    for (const [s, e] of spans) {
      for (const side of [-1, 1]) {
        const f = (side * t) / 2;
        put(s, e, 0, 0.09, side < 0 ? f - 0.012 : f, side < 0 ? f : f + 0.012, 'skirting');
      }
    }
  }

  /** 個別メッシュを登録（name があれば named に入れる） */
  add(obj: THREE.Object3D, name?: string, occluder = false): THREE.Object3D {
    this.root.add(obj);
    if (name) this.named.set(name, obj);
    if (occluder) this.occluders.push(obj);
    return obj;
  }

  /** 調べられる物として登録する */
  interactable(id: string, obj: THREE.Object3D): THREE.Object3D {
    obj.userData.interactId = id;
    this.add(obj, id);
    this.pickables.push(obj);
    return obj;
  }

  /** 見えない当たり箱で調べられる範囲を作る（静的な物を調べたいとき） */
  hitbox(id: string, min: Vec3, max: Vec3): THREE.Mesh {
    const geo = boxGeometry(min, max);
    const mesh = new THREE.Mesh(geo, this.hitMat);
    this.interactable(id, mesh);
    return mesh;
  }

  /** 見えない当たり箱（調べられる物の子にして、狙いやすくする） */
  hitShape(size: Vec3, pos: Vec3): THREE.Mesh {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), this.hitMat);
    mesh.position.set(pos[0], pos[1], pos[2]);
    return mesh;
  }

  openable(name: string, pivot: THREE.Object3D, openRotY: number, colliderTag?: string, slide: Vec3 = [0, 0, 0]): void {
    this.openables.set(name, { pivot, openRotY, slide, basePos: pivot.position.clone(), colliderTag, progress: 0, opening: false, rattleLeft: 0, rattleTimer: 0, rattleAmount: 0, rattleTarget: 0 });
  }

  spawn(name: string, x: number, z: number, yaw: number): void {
    this.spawns.set(name, { x, z, yaw });
  }

  /** 結合して scene に追加する */
  finalize(): void {
    for (const [key, geos] of this.pending) {
      const merged = mergeGeometries(geos, false);
      if (!merged) continue;
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, this.mat(key));
      mesh.matrixAutoUpdate = false;
      // 壁・床などの結合済みの物（影は受けるだけ）
      mesh.userData.static = true;
      this.root.add(mesh);
      this.occluders.push(mesh);
      for (const g of geos) g.dispose();
    }
    this.pending.clear();
    for (const [material, geos] of this.pendingMat) {
      const merged = mergeGeometries(geos, false);
      if (!merged) continue;
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, material);
      mesh.matrixAutoUpdate = false;
      mesh.userData.static = true;
      // 小さな飾りなので、視線や照準はさえぎらない
      this.root.add(mesh);
      for (const g of geos) g.dispose();
    }
    this.pendingMat.clear();
    for (const { geometry, material, matrices } of this.instances.values()) {
      const mesh = new THREE.InstancedMesh(geometry, material, matrices.length);
      matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      this.root.add(mesh);
    }
    this.instances.clear();
  }

  private queue(key: string, geo: THREE.BufferGeometry): void {
    // mergeGeometries は属性が揃っている必要がある
    if (geo.index) geo = geo.toNonIndexed();
    let list = this.pending.get(key);
    if (!list) {
      list = [];
      this.pending.set(key, list);
    }
    list.push(geo);
  }

  /** 頂点のワールド座標から UV を決める（面の向きで投影軸を選ぶ） */
  private applyWorldUV(geo: THREE.BufferGeometry, matKey: string): void {
    const def = this.materials[matKey];
    const tw = def?.texW ?? 1;
    const th = def?.texH ?? tw;
    const pos = geo.getAttribute('position');
    const nor = geo.getAttribute('normal');
    const uv = geo.getAttribute('uv');
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      const nx = Math.abs(nor.getX(i));
      const ny = Math.abs(nor.getY(i));
      if (ny > 0.5) uv.setXY(i, x / tw, -z / tw);
      else if (nx > 0.5) uv.setXY(i, z / tw, y / th);
      else uv.setXY(i, x / tw, y / th);
    }
    uv.needsUpdate = true;
  }
}

function boxGeometry(a: Vec3, b: Vec3): THREE.BufferGeometry {
  const min: Vec3 = [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.min(a[2], b[2])];
  const max: Vec3 = [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.max(a[2], b[2])];
  const sx = max[0] - min[0];
  const sy = max[1] - min[1];
  const sz = max[2] - min[2];
  const geo = new THREE.BoxGeometry(sx, sy, sz);
  geo.translate(min[0] + sx / 2, min[1] + sy / 2, min[2] + sz / 2);
  return geo;
}

/** BoxGeometry の各面 UV を実寸 / テクスチャ寸法に合わせて拡大する */
function scaleBoxUV(geo: THREE.BufferGeometry, size: Vec3, tw: number, th: number): void {
  const uv = geo.getAttribute('uv');
  // 面の並び: +x, -x, +y, -y, +z, -z（各 4 頂点）
  const faces: [number, number][] = [
    [size[2], size[1]],
    [size[2], size[1]],
    [size[0], size[2]],
    [size[0], size[2]],
    [size[0], size[1]],
    [size[0], size[1]],
  ];
  for (let f = 0; f < 6; f++) {
    for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      uv.setXY(i, (uv.getX(i) * faces[f][0]) / tw, (uv.getY(i) * faces[f][1]) / th);
    }
  }
  uv.needsUpdate = true;
}
