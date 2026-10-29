import * as THREE from 'three';
import type { MaterialDef } from './builder';
import {
  asphaltTexture,
  ceilingTexture,
  fenceTexture,
  fusumaTexture,
  tatamiTexture,
  grassTexture,
  productTexture,
  cubbyTexture,
  floorTexture,
  nightWindowTexture,
  paintedMetalTexture,
  tileTexture,
  wallTexture,
  woodFloorTexture,
  woodTexture, facadeTexture, skyTexture } from '../engine/textures';

/** 床の月明かりの形（窓の桟の影つき） */
function moonTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(64, 64, 10, 64, 64, 80);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = 'rgba(0,0,0,0.9)';
  ctx.fillRect(61, 0, 6, 128);
  ctx.fillRect(0, 40, 128, 4);
  return new THREE.CanvasTexture(c);
}

/** ステージで使う材質。キー名で builder から参照する */
export function createMaterials(): Record<string, MaterialDef> {
  const lambert = (opts: THREE.MeshLambertMaterialParameters) => new THREE.MeshLambertMaterial(opts);
  return {
    wall: { material: lambert({ map: wallTexture() }), texW: 2, texH: 3 },
    floor: { material: lambert({ map: floorTexture() }), texW: 2 },
    woodfloor: { material: lambert({ map: woodFloorTexture() }), texW: 2 },
    ceiling: { material: lambert({ map: ceilingTexture() }), texW: 1 },
    tile: { material: lambert({ map: tileTexture() }), texW: 1.2 },
    tilefloor: { material: lambert({ map: tileTexture('#8f9a94') }), texW: 0.9 },
    wood: { material: lambert({ map: woodTexture() }), texW: 1 },
    stall: { material: lambert({ map: paintedMetalTexture('#b98a8c') }), texW: 1 },
    stallDoor: { material: lambert({ map: paintedMetalTexture('#a8787b') }), texW: 1 },
    locker: { material: lambert({ map: paintedMetalTexture('#6f7d78') }), texW: 1 },
    doorMetal: { material: lambert({ map: paintedMetalTexture('#58665f') }), texW: 1 },
    metalGray: { material: lambert({ map: paintedMetalTexture('#6b6f6a') }), texW: 1 },
    cubby: { material: lambert({ map: cubbyTexture() }), texW: 1.2, texH: 1.8 },
    curtain: { material: lambert({ color: 0xcfd2c6, transparent: true, opacity: 0.93 }) },
    blanket: { material: lambert({ color: 0x7d8796 }) },
    // 校舎の外
    asphalt: { material: lambert({ map: asphaltTexture() }), texW: 4 },
    grass: { material: lambert({ map: grassTexture() }), texW: 2 },
    facade: { material: lambert({ map: facadeTexture() }), texW: 3, texH: 3 },
    leaves: { material: lambert({ color: 0x1c2c1a }) },
    leavesDark: { material: lambert({ color: 0x121e12 }) },
    sky: { material: new THREE.MeshBasicMaterial({ map: skyTexture(), fog: false }), texW: 24 },
    paint: { material: lambert({ color: 0xbdbdb4 }) },
    rail: { material: lambert({ color: 0xc8c8c0 }) },
    pole: { material: lambert({ color: 0x6a6660 }) },
    concrete: { material: lambert({ map: paintedMetalTexture('#8a8a84') }), texW: 1 },
    // コンビニ
    storeFloor: { material: lambert({ map: tileTexture('#e6e6e0') }), texW: 0.8 },
    storeCeil: { material: lambert({ color: 0xe8e8e4 }) },
    storeWall: { material: lambert({ map: paintedMetalTexture('#dcdcd6') }), texW: 1 },
    counter: { material: lambert({ map: paintedMetalTexture('#cfd0cc') }), texW: 1 },
    shelf: { material: lambert({ color: 0xb8b8b2 }) },
    goodsA: { material: lambert({ map: productTexture('a', ['#c03a3a', '#e8c040', '#3a7ac0', '#f0f0e8', '#40a060']) }), texW: 1.2, texH: 0.4 },
    goodsB: { material: lambert({ map: productTexture('b', ['#e07a2a', '#8a4ac0', '#f0f0e8', '#2a2a2a', '#e05a8a']) }), texW: 1.2, texH: 0.4 },
    screen: { material: new THREE.MeshBasicMaterial({ color: 0x6a9a7a }) },
    storeGlass: {
      material: new THREE.MeshBasicMaterial({ color: 0x4a5650, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }),
    },
    doorGlass: { material: new THREE.MeshLambertMaterial({ color: 0x9ab0b0, transparent: true, opacity: 0.25, depthWrite: false }) },
    // 和室・民家
    // 写真の畳は 1 枚の画像に 2 畳（1.8m 四方）
    tatami: { material: lambert({ map: tatamiTexture() }), texW: 1.8 },
    fusuma: { material: lambert({ map: fusumaTexture() }), texW: 0.9, texH: 1.8 },
    fence: { material: lambert({ map: fenceTexture() }), texW: 2, texH: 2 },
    plaster: { material: lambert({ map: paintedMetalTexture('#a89c84') }), texW: 1.2 },
    homeWall: { material: lambert({ map: paintedMetalTexture('#c8c0ac') }), texW: 1.2 },
    lacquer: { material: new THREE.MeshPhongMaterial({ color: 0x0e0a08, specular: 0x554433, shininess: 60 }) },
    gold: { material: lambert({ color: 0xb08a3a, emissive: 0x1a1206 }) },
    roof: { material: lambert({ color: 0x25272c }), texW: 2 },
    metal: { material: lambert({ color: 0x8d918f }) },
    frame: { material: lambert({ color: 0x7c807d }) },
    skirting: { material: lambert({ color: 0x2a2a24 }) },
    porcelain: { material: lambert({ color: 0xd9d6cc }) },
    red: { material: lambert({ color: 0x8c1a14 }) },
    dark: { material: lambert({ color: 0x0b0b0b }) },
    night: { material: new THREE.MeshBasicMaterial({ map: nightWindowTexture(), color: 0x9aa8c8 }) },
    glassDark: { material: new THREE.MeshBasicMaterial({ color: 0x0b111c }) },
    mirror: {
      material: new THREE.MeshPhongMaterial({ color: 0x1a1e22, specular: 0xb0c0d0, shininess: 120 }),
    },
    moon: {
      material: new THREE.MeshBasicMaterial({
        map: moonTexture(),
        color: 0x3a4a78,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        // 床に貼りつく光なので、遠くでも床とちらつかないよう手前に寄せる
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      }),
    },
  };
}
