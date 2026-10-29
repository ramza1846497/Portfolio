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
};

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
