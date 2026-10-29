import * as THREE from 'three';
import type { MaterialDef } from './builder';

/**
 * 写真から作った質感（Poly Haven の CC0 テクスチャを public/textures に焼いた物）。
 * 色・法線（凹凸）・粗さの 3 枚で、懐中電灯の光が当たると凹凸やつやが出る。
 * 読み込めるまでは（読み込めなかったときも）canvas で描いた今までの模様のまま。
 */
interface PbrDef {
  /** 色の画像 */
  d: string;
  /** 法線・粗さの画像（同じ素材の色違いは共有） */
  src: string;
  /** 凹凸の強さ */
  bump?: number;
}

const PBR: Record<string, PbrDef> = {
  wall: { d: 'wall_d', src: 'wall' },
  floor: { d: 'floor_d', src: 'linoleum_brown' },
  woodfloor: { d: 'woodfloor_d', src: 'wood_floor' },
  ceiling: { d: 'ceiling_d', src: 'ceiling_interior' },
  tile: { d: 'tile_d', src: 'rounded_square_tiled_wall' },
  tilefloor: { d: 'tilefloor_d', src: 'square_tiles_02' },
  wood: { d: 'wood_d', src: 'oak_veneer_01' },
  stall: { d: 'stall_d', src: 'rusty_painted_metal', bump: 0.6 },
  stallDoor: { d: 'stallDoor_d', src: 'rusty_painted_metal', bump: 0.6 },
  locker: { d: 'locker_d', src: 'rusty_painted_metal', bump: 0.6 },
  doorMetal: { d: 'doorMetal_d', src: 'rusty_painted_metal', bump: 0.6 },
  metalGray: { d: 'metalGray_d', src: 'rusty_painted_metal', bump: 0.6 },
  concrete: { d: 'concrete_d', src: 'concrete_wall_008' },
  asphalt: { d: 'asphalt_d', src: 'asphalt_02' },
  grass: { d: 'grass_d', src: 'sparse_grass' },
  plaster: { d: 'plaster_d', src: 'clay_plaster' },
  homeWall: { d: 'homeWall_d', src: 'plastered_wall_02' },
  storeWall: { d: 'storeWall_d', src: 'plastered_wall_04', bump: 0.5 },
  counter: { d: 'counter_d', src: 'plastered_wall_04', bump: 0.4 },
  tatami: { d: 'tatami_d', src: 'tatami_mat' },
  roof: { d: 'roof_d', src: 'grey_roof_tiles' },
  fence: { d: 'fence_d', src: 'concrete_block_wall' },
  bamboo: { d: 'bamboo_d', src: 'bamboo_wall_02' },
  leather: { d: 'leather_d', src: 'fabric_leather_02' },
  hydrant: { d: 'hydrant_d', src: 'rusty_painted_metal', bump: 0.5 },
  labTop: { d: 'labTop_d', src: 'concrete_wall_008', bump: 0.4 },
  statueStone: { d: 'statueStone_d', src: 'granite_wall' },
  moss: { d: 'moss_d', src: 'mossy_stone_wall' },
  porcelainSkin: { d: 'porcelainSkin_d', src: 'marble_01', bump: 0.3 },
  clothWhite: { d: 'clothWhite_d', src: 'cotton_jersey' },
  clothRed: { d: 'clothRed_d', src: 'cotton_jersey' },
  clothDark: { d: 'clothDark_d', src: 'cotton_jersey' },
  clothGray: { d: 'clothGray_d', src: 'cotton_jersey' },
  fleece: { d: 'fleece_d', src: 'knitted_fleece' },
};

const texCache = new Map<string, THREE.Texture>();
/** 写真の質感 1 枚（同じ物は使い回す）。読み込めないときは何も貼らないまま */
function tex(name: string, color: boolean, repeat: number): THREE.Texture {
  const key = `${name}@${repeat}`;
  let t = texCache.get(key);
  if (!t) {
    t = new THREE.TextureLoader().load(`${BASE}${name}.webp`, undefined, undefined, () => console.warn(`[pbr] could not load ${name}`));
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat, repeat);
    t.anisotropy = 4;
    if (color) t.colorSpace = THREE.SRGBColorSpace;
    texCache.set(key, t);
  }
  return t;
}

/**
 * 人物・敵・小物用：写真の質感の材質をすぐに作る（読み込みは後から追いつく）。
 * repeat は UV 1 あたりに何回くり返すか（球や円柱の UV は 0〜1 なので、細かくしたいときに上げる）。
 */
export function pbrMaterial(key: string, opts: { repeat?: number; color?: number; transparent?: boolean; opacity?: number; side?: THREE.Side; roughness?: number } = {}): THREE.MeshStandardMaterial {
  const p = PBR[key];
  if (!p) throw new Error(`unknown pbr material: ${key}`);
  const r = opts.repeat ?? 1;
  const m = new THREE.MeshStandardMaterial({
    map: tex(p.d, true, r),
    normalMap: tex(`${p.src}_n`, false, r),
    roughnessMap: tex(`${p.src}_r`, false, r),
    color: opts.color ?? 0xffffff,
    roughness: opts.roughness ?? 1,
    metalness: 0,
    transparent: opts.transparent ?? false,
    opacity: opts.opacity ?? 1,
    side: opts.side ?? THREE.FrontSide,
    depthWrite: !(opts.transparent ?? false),
  });
  m.normalScale.set(p.bump ?? 1, p.bump ?? 1);
  return m;
}

const BASE = './textures/';

/**
 * 材質を写真の質感に差し替える。lite = true（画質「低」）は軽い材質のまま法線だけ足す。
 * すでに組み立てたメッシュの材質も入れ替える。
 */
export function upgradeMaterials(scene: THREE.Scene, defs: Record<string, MaterialDef>, lite: boolean, anisotropy: number): void {
  const loader = new THREE.TextureLoader();
  const load = (name: string, color: boolean, done: (t: THREE.Texture) => void) =>
    loader.load(
      `${BASE}${name}.webp`,
      (t) => {
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.anisotropy = anisotropy;
        if (color) t.colorSpace = THREE.SRGBColorSpace;
        done(t);
      },
      undefined,
      () => console.warn(`[pbr] could not load ${name}`),
    );

  const swap = new Map<THREE.Material, THREE.Material>();
  for (const [key, p] of Object.entries(PBR)) {
    const def = defs[key];
    if (!def || !(def.material instanceof THREE.MeshLambertMaterial)) continue;
    const old = def.material;
    const params = { map: old.map, color: old.color.clone(), transparent: old.transparent, opacity: old.opacity, side: old.side };
    const m = lite ? new THREE.MeshLambertMaterial(params) : new THREE.MeshStandardMaterial({ ...params, roughness: 1, metalness: 0 });
    const scale = p.bump ?? 1;
    load(p.d, true, (t) => {
      m.map = t;
      m.color.set(0xffffff);
      m.needsUpdate = true;
    });
    load(`${p.src}_n`, false, (t) => {
      m.normalMap = t;
      m.normalScale.set(scale, scale);
      m.needsUpdate = true;
    });
    if (m instanceof THREE.MeshStandardMaterial) {
      load(`${p.src}_r`, false, (t) => {
        m.roughnessMap = t;
        m.needsUpdate = true;
      });
    }
    def.material = m;
    swap.set(old, m);
  }
  scene.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    o.material = Array.isArray(o.material) ? o.material.map((x) => swap.get(x) ?? x) : (swap.get(o.material) ?? o.material);
  });
}
