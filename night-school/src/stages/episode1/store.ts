import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { WorldBuilder } from '../../world/builder';

/*
 * コンビニの売り物：箱・缶・カップ麺・ペットボトル・たばこ。
 * 包装の絵柄は 1 枚の画像（8×8 のます目）にまとめて描き、形は材質ごとに 1 つにまとめる（描く回数を増やさない）。
 */

const CELLS = 8;

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

type Kind = 'box' | 'can' | 'cup' | 'bottle' | 'pack' | 'item';

/** 絵柄の種類：名前・地の色・帯の色・文字の色・形 */
const DESIGNS: [string, string, string, string, Kind][] = [
  ['カレー', '#e8b830', '#b02a1a', '#3a1a08', 'box'],
  ['シチュー', '#f0ece0', '#c8742a', '#5a2a10', 'box'],
  ['ポテト', '#e83a2a', '#f0d040', '#ffffff', 'box'],
  ['チョコ', '#5a2a18', '#c8a060', '#f8e8c8', 'box'],
  ['クッキー', '#2a5aa8', '#f0e0b0', '#ffffff', 'box'],
  ['せんべい', '#c89a5a', '#7a2a1a', '#2a1a0a', 'box'],
  ['シリアル', '#f0c020', '#2a7ac0', '#ffffff', 'box'],
  ['ティッシュ', '#e8eef2', '#7ab0d8', '#2a4a7a', 'box'],
  ['緑茶', '#2a7a3a', '#e8f0d8', '#ffffff', 'bottle'],
  ['水', '#d8ecf4', '#3a8ad0', '#1a3a6a', 'bottle'],
  ['紅茶', '#c84a2a', '#f0e0c0', '#ffffff', 'bottle'],
  ['スポーツ', '#2a6ad8', '#f0f4f8', '#ffffff', 'bottle'],
  ['コーラ', '#c81a1a', '#f8f8f8', '#ffffff', 'can'],
  ['コーヒー', '#3a2418', '#c8a070', '#f0e0c0', 'can'],
  ['サイダー', '#2aa8d8', '#f0f8f8', '#ffffff', 'can'],
  ['ビール', '#d8c040', '#f8f4e8', '#2a2a2a', 'can'],
  ['ラーメン', '#f0ece4', '#c82a1a', '#2a2a2a', 'cup'],
  ['うどん', '#e8e0d0', '#2a5a2a', '#1a1a1a', 'cup'],
  ['そば', '#e8e4dc', '#5a3a2a', '#1a1a1a', 'cup'],
  ['焼きそば', '#f0d030', '#2a2a2a', '#c81a1a', 'cup'],
  ['洗剤', '#f0f4f8', '#2a9ad8', '#1a3a6a', 'box'],
  ['電池', '#1a1a1a', '#e8a020', '#f8f8f8', 'box'],
  ['ガム', '#40c080', '#f8f8f8', '#ffffff', 'box'],
  ['のど飴', '#a83a6a', '#f0d0e0', '#ffffff', 'box'],
  ['LUCKY', '#f0f0ec', '#c81a1a', '#1a1a1a', 'pack'],
  ['PEACE', '#1a2a5a', '#c8a040', '#f0e0b0', 'pack'],
  ['HOPE', '#3a8ac0', '#f0f0f0', '#ffffff', 'pack'],
  ['SEVEN', '#f0f0f0', '#2a5aa8', '#1a1a1a', 'pack'],
  // 調べて買う物（棚には並べない）
  ['まんじゅう', '#f4ecd8', '#8a4a2a', '#3a1a0a', 'item' as Kind],
  ['お線香', '#3a5a3a', '#c8a050', '#f0e8d0', 'item' as Kind],
  ['おにぎり', '#f8f8f4', '#1a1a1a', '#c81a1a', 'item' as Kind],
  ['いちごあめ', '#f070a0', '#f8f0f4', '#ffffff', 'item' as Kind],
  ['牛乳', '#f8f8f8', '#2a6ac0', '#1a3a7a', 'item' as Kind],
];

let atlas: THREE.CanvasTexture | null = null;
let goodsMat: THREE.MeshStandardMaterial | null = null;

function material(): THREE.MeshStandardMaterial {
  goodsMat ??= new THREE.MeshStandardMaterial({ map: labelAtlas(), roughness: 0.45, metalness: 0.05 });
  return goodsMat;
}

/** 包装の絵柄を 1 枚の画像に描く */
function labelAtlas(): THREE.CanvasTexture {
  if (atlas) return atlas;
  const S = 1024;
  const cell = S / CELLS;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d')!;
  const rand = rng(17);
  DESIGNS.forEach(([name, bg, band, ink], i) => {
    const x = (i % CELLS) * cell;
    const y = Math.floor(i / CELLS) * cell;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, cell, cell);
    ctx.clip();
    ctx.fillStyle = bg;
    ctx.fillRect(x, y, cell, cell);
    // 帯と、斜めの飾り
    ctx.fillStyle = band;
    ctx.fillRect(x, y + cell * (0.55 + rand() * 0.1), cell, cell * 0.18);
    ctx.globalAlpha = 0.35;
    ctx.beginPath();
    ctx.moveTo(x, y + cell * 0.2);
    ctx.lineTo(x + cell, y);
    ctx.lineTo(x + cell, y + cell * 0.12);
    ctx.lineTo(x, y + cell * 0.32);
    ctx.fill();
    ctx.globalAlpha = 1;
    // 商品名
    ctx.fillStyle = ink;
    const size = Math.min(cell * 0.3, (cell * 0.92) / Math.max(2, name.length));
    ctx.font = `bold ${size}px "Hiragino Sans", "Noto Sans JP", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(name, x + cell / 2, y + cell * 0.38);
    // 写真の代わりの丸い絵と、バーコード
    ctx.fillStyle = band;
    ctx.beginPath();
    ctx.arc(x + cell * 0.75, y + cell * 0.82, cell * 0.08, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f8f8f8';
    ctx.fillRect(x + cell * 0.1, y + cell * 0.78, cell * 0.3, cell * 0.14);
    ctx.fillStyle = '#111';
    for (let k = 0; k < 16; k++) if (rand() < 0.6) ctx.fillRect(x + cell * 0.12 + k * cell * 0.016, y + cell * 0.8, cell * 0.008, cell * 0.1);
    ctx.restore();
  });
  atlas = new THREE.CanvasTexture(c);
  atlas.colorSpace = THREE.SRGBColorSpace;
  atlas.anisotropy = 4;
  return atlas;
}

/** 形の UV を、絵柄 i のます目に収める */
function toCell(geo: THREE.BufferGeometry, i: number): THREE.BufferGeometry {
  const uv = geo.getAttribute('uv');
  const cx = (i % CELLS) / CELLS;
  const cy = 1 - (Math.floor(i / CELLS) + 1) / CELLS;
  for (let k = 0; k < uv.count; k++) uv.setXY(k, cx + uv.getX(k) / CELLS * 0.98 + 0.001, cy + uv.getY(k) / CELLS * 0.98 + 0.001);
  return geo;
}

/** 商品 1 個の形（底の中心が原点、正面は +z） */
function productGeo(kind: Kind, i: number, s: number): THREE.BufferGeometry {
  let g: THREE.BufferGeometry;
  switch (kind) {
    case 'box': {
      const w = 0.09 + s * 0.12;
      const h = 0.12 + s * 0.16;
      g = new THREE.BoxGeometry(w, h, 0.05 + s * 0.06);
      g.translate(0, h / 2, 0);
      break;
    }
    case 'item':
    case 'pack':
      g = new THREE.BoxGeometry(0.055, 0.088, 0.022);
      g.translate(0, 0.044, 0);
      break;
    case 'can':
      g = new THREE.CylinderGeometry(0.033, 0.033, 0.122, 12);
      g.translate(0, 0.061, 0);
      break;
    case 'cup':
      g = new THREE.CylinderGeometry(0.058, 0.045, 0.1, 14);
      g.translate(0, 0.05, 0);
      break;
    case 'bottle': {
      const pts: [number, number][] = [
        [0.0, 0.0],
        [0.03, 0.0],
        [0.033, 0.01],
        [0.033, 0.14],
        [0.028, 0.17],
        [0.013, 0.195],
        [0.013, 0.215],
        [0.0, 0.215],
      ];
      g = new THREE.LatheGeometry(
        pts.map(([r, y]) => new THREE.Vector2(r, y)),
        12,
      );
      break;
    }
  }
  if (g.index) g = g.toNonIndexed();
  // 正面に商品名が来るよう、円柱は向きを回しておく
  if (kind === 'can' || kind === 'cup' || kind === 'bottle') g.rotateY(-Math.PI / 2);
  return toCell(g, i);
}

/** 絵柄を種類で引く */
function designsOf(kind: Kind): number[] {
  return DESIGNS.flatMap(([, , , , k], i) => (k === kind ? [i] : []));
}

export interface GoodsRow {
  /** 並べる範囲（x） */
  x1: number;
  x2: number;
  /** 棚板の上の高さ */
  y: number;
  /** 一番手前の z と、奥へ向かう向き（+1 なら +z が奥） */
  front: number;
  depthDir: 1 | -1;
  /** 棚の高さの余裕（これより高い物は置かない） */
  room: number;
  /** 置き方：段ごとに種類をまとめる */
  kinds: Kind[];
  /** 物を置かない場所（調べられる売り物のまわり） */
  avoid?: [number, number][];
}

/** 棚に商品を並べる。並べた物はまとめて 1 つの形にして足す */
export function fillShelves(b: WorldBuilder, rows: GoodsRow[], seed = 1, place?: (g: THREE.BufferGeometry) => void): void {
  const rand = rng(seed);
  const geos: THREE.BufferGeometry[] = [];
  const m = new THREE.Matrix4();
  for (const row of rows) {
    let x = row.x1 + 0.04;
    while (x < row.x2 - 0.06) {
      // 同じ商品を何個か横に並べる（フェイス）
      const kind = row.kinds[Math.floor(rand() * row.kinds.length)];
      const list = designsOf(kind);
      const design = list[Math.floor(rand() * list.length)];
      const s = rand();
      const one = productGeo(kind, design, s);
      one.computeBoundingBox();
      const bb = one.boundingBox!;
      const w = bb.max.x - bb.min.x;
      const d = bb.max.z - bb.min.z;
      const h = bb.max.y - bb.min.y;
      if (h > row.room) {
        one.dispose();
        x += 0.05;
        continue;
      }
      const faces = 2 + Math.floor(rand() * 4);
      const deep = Math.max(1, Math.min(3, Math.floor(0.28 / (d + 0.01))));
      for (let f = 0; f < faces && x + w / 2 < row.x2 - 0.02; f++) {
        const blocked = row.avoid?.some(([ax, ay]) => Math.abs(ax - x) < 0.22 && ay > row.y - 0.08 && ay < row.y + row.room);
        // ところどころ売り切れて空いている
        if (!blocked && rand() > 0.08) {
          for (let k = 0; k < deep; k++) {
            if (k > 0 && rand() < 0.25) break;
            const z = row.front + row.depthDir * (d / 2 + 0.015 + k * (d + 0.008));
            // 正面（+z）を手前へ向ける
            const yaw = (row.depthDir > 0 ? Math.PI : 0) + (rand() - 0.5) * 0.12;
            m.compose(new THREE.Vector3(x + (rand() - 0.5) * 0.008, row.y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), new THREE.Vector3(1, 1, 1));
            geos.push(one.clone().applyMatrix4(m));
          }
        }
        x += w + 0.006;
      }
      one.dispose();
      x += 0.02;
    }
  }
  if (!geos.length) return;
  const merged = mergeGeometries(geos, false);
  for (const g of geos) g.dispose();
  if (!merged) return;
  place?.(merged);
  b.staticMesh(new THREE.Mesh(merged, material()));
}

/**
 * ガラス扉の冷蔵ケース。face の面（-x 向き）に扉、奥に飲み物の棚。
 * x はケースの前面、z1〜z2 が幅
 */
export function drinkCooler(b: WorldBuilder, x: number, z1: number, z2: number, avoid: [number, number][]): void {
  const depth = 0.55;
  // 箱（側板・天板・底）は builder の形で
  b.box([x, 0, z1], [x + depth, 0.12, z2], 'dark', { collide: true });
  b.box([x, 2.0, z1], [x + depth, 2.2, z2], 'counter');
  b.box([x + depth - 0.02, 0.12, z1], [x + depth, 2.0, z2], 'porcelain');
  // 中の棚板（金網の代わりに薄い板）
  const shelves = [0.12, 0.52, 0.9, 1.28, 1.64];
  for (const y of shelves) b.box([x + 0.02, y, z1], [x + depth - 0.02, y + 0.015, z2], 'metal');
  // 扉の枠（縦の桟）
  const doors = Math.max(2, Math.round((z2 - z1) / 0.9));
  for (let i = 0; i <= doors; i++) {
    const z = z1 + ((z2 - z1) * i) / doors;
    b.box([x - 0.03, 0.12, z - 0.025], [x + 0.01, 2.0, z + 0.025], 'metal');
    if (i < doors) {
      // 取っ手
      const zh = z + (z2 - z1) / doors - 0.08;
      b.box([x - 0.06, 0.8, zh - 0.012], [x - 0.03, 1.4, zh + 0.012], 'metal');
    }
  }
  b.box([x - 0.03, 1.96, z1], [x + 0.01, 2.0, z2], 'metal');
  b.box([x - 0.03, 0.12, z1], [x + 0.01, 0.16, z2], 'metal');
  // 奥の白い光（庫内灯）
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(z2 - z1, 1.84), new THREE.MeshBasicMaterial({ color: 0x8a9ea4 }));
  glow.rotation.y = -Math.PI / 2;
  glow.position.set(x + depth - 0.025, 1.06, (z1 + z2) / 2);
  b.staticMesh(glow);
  // 飲み物：棚の並び（x）をケースの幅（z）に、奥行きを +x に向ける
  fillShelves(
    b,
    shelves.slice(0, 4).map((y, i) => ({
      x1: z1,
      x2: z2,
      y: y + 0.015,
      front: 0,
      depthDir: -1 as const,
      room: shelves[i + 1] - y - 0.04,
      kinds: i % 2 ? ['can'] : ['bottle', 'bottle', 'can'],
      avoid,
    })),
    31,
    (g) => g.rotateY(-Math.PI / 2).translate(x + 0.04, 0, 0),
  );
  // ガラス（うっすら映り込む）
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(z2 - z1, 1.84), new THREE.MeshStandardMaterial({ color: 0xd8e8ec, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.12, depthWrite: false }));
  glass.rotation.y = -Math.PI / 2;
  glass.position.set(x - 0.01, 1.06, (z1 + z2) / 2);
  b.staticMesh(glass);
}

/**
 * 調べて買う売り物の見た目（3 個並び）。原点は底の中心、正面は +z。
 * 材質は 1 つずつ複製する（調べたときに光らせる演出があっても、棚の商品まで光らないように）
 */
export function storeItemMesh(id: 'manju' | 'senko' | 'onigiri' | 'candy' | 'milk'): THREE.Group {
  const name = { manju: 'まんじゅう', senko: 'お線香', onigiri: 'おにぎり', candy: 'いちごあめ', milk: '牛乳' }[id];
  const i = DESIGNS.findIndex(([n]) => n === name);
  const mat = material().clone();
  const g = new THREE.Group();
  for (let k = 0; k < 3; k++) {
    let geo: THREE.BufferGeometry;
    if (id === 'onigiri') {
      // 三角のおにぎり（フィルム包装）
      geo = new THREE.CylinderGeometry(0.06, 0.06, 0.035, 3);
      geo.rotateX(Math.PI / 2);
      geo.rotateZ(Math.PI / 2);
      geo.translate(0, 0.05, 0);
    } else if (id === 'milk') {
      // 紙パック：四角い胴に、切妻の屋根
      const body = new THREE.BoxGeometry(0.07, 0.15, 0.07).translate(0, 0.075, 0).toNonIndexed();
      const roof = new THREE.CylinderGeometry(0.05, 0.05, 0.07, 4, 1).rotateZ(Math.PI / 2).rotateX(Math.PI / 4).scale(1, 0.55, 0.7).translate(0, 0.17, 0).toNonIndexed();
      geo = mergeGeometries([body, roof.deleteAttribute('uv').setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(roof.getAttribute('position').count * 2), 2))])!;
    } else {
      const [w, h, d] = id === 'senko' ? [0.06, 0.2, 0.03] : id === 'candy' ? [0.12, 0.16, 0.035] : [0.13, 0.05, 0.1];
      geo = new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0);
    }
    const mesh = new THREE.Mesh(toCell(geo.index ? geo.toNonIndexed() : geo, i), mat);
    mesh.position.x = (k - 1) * 0.15;
    mesh.rotation.y = (k - 1) * 0.08;
    g.add(mesh);
  }
  return g;
}
