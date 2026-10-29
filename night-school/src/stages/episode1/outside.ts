import * as THREE from 'three';
import type { BuildContext } from '../../game/types';
import { guardRail, utilityPole } from './props';
import type { WorldBuilder } from '../../world/builder';
import { newspaperTexture, noticeTexture, paperTexture, signTexture, storeSignTexture } from '../../engine/textures';
import { H, ghostFigure, wallPlane } from './parts';
import { drinkCooler, fillShelves, storeItemMesh, type GoodsRow } from './store';

/**
 * 校舎の外（z = ZO 付近）。1 階からさらに z をずらした場所に作る。
 *
 *   校門 ─── 霧の一本道（x: -3〜60）─── 駐車場 ── コンビニ「ヨミマート」（x: 70〜80）
 *
 * 本来なら細い道と民家が並んでいるはずだが、何もない。
 */
export const ZO = 150;

/** コンビニの中（トリガーや怪異の判定に使う） */
export const STORE = { minX: 70.2, maxX: 79.8, minZ: ZO - 6.8, maxZ: ZO + 6.8 };

export function buildOutside({ builder: b, lights }: BuildContext): void {
  buildRoad(b, lights);
  buildStore(b, lights);
  buildShoppingList(b);
  b.spawn('outsideStart', -1.6, ZO, -Math.PI / 2);
  b.spawn('storeIn', 71.6, ZO, -Math.PI / 2);
}

function buildRoad(b: WorldBuilder, lights: BuildContext['lights']): void {
  // 道路と、その両脇の草むら（その先は霧に溶けて何もない）
  b.plane(-4, ZO - 2.5, 60, ZO + 2.5, 0, 'asphalt');
  b.plane(-4, ZO - 16, 60, ZO - 2.5, 0, 'grass');
  b.plane(-4, ZO + 2.5, 60, ZO + 16, 0, 'grass');
  for (let x = -2; x < 58; x += 3) b.box([x, 0, ZO - 0.06], [x + 1.5, 0.006, ZO + 0.06], 'paint');
  b.box([-4, 0, ZO - 2.36], [60, 0.006, ZO - 2.28], 'paint');
  b.box([-4, 0, ZO + 2.28], [60, 0.006, ZO + 2.36], 'paint');

  // ガードレール（道から外へは出られない）
  for (const side of [-1, 1]) {
    const z = ZO + side * 2.75;
    guardRail(b, 1, 58, z, side as 1 | -1);
    b.collision.add(-4, z - 0.15, 60, z + 0.15);
  }

  // 電柱と街灯（ほとんど消えている）
  for (const x of [6, 18, 30, 42, 54]) utilityPole(b, x, ZO + 3.43, { transformer: x === 30, lamp: true });
  // 電線（電柱のあいだで少したるむ）
  const poles = [-6, 6, 18, 30, 42, 54, 66];
  for (const [y, dz] of [
    [7.38, -0.5],
    [7.38, 0],
    [7.38, 0.5],
    [6.66, -0.4],
    [6.66, 0.4],
  ]) {
    for (let i = 0; i < poles.length - 1; i++) {
      const a = poles[i];
      const span = poles[i + 1] - a;
      const pts: THREE.Vector3[] = [];
      for (let k = 0; k <= 8; k++) {
        const t = k / 8;
        pts.push(new THREE.Vector3(a + span * t, y - Math.sin(t * Math.PI) * 0.45, ZO + 3.43 + dz));
      }
      b.mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.008, 4), 'dark');
    }
  }
  // マンホールと配電箱
  for (const x of [12, 36, 50]) b.prop('water_manhole_cover', [x, 0.002, ZO - 0.9], x * 0.3);
  if (b.prop('utility_box_01', [30.6, 0, ZO + 3.2], Math.PI)) b.collision.add(30.3, ZO + 2.95, 30.9, ZO + 3.45);
  lights.addFluorescent(18, 4.95, ZO + 2.0, 'flicker', Math.PI / 2, 3.2, 'street');
  lights.addFluorescent(42, 4.95, ZO + 2.0, 'dim', Math.PI / 2, 3.2, 'street');
  for (const x of [6, 30, 54]) lights.addFluorescent(x, 4.95, ZO + 2.0, 'dead', Math.PI / 2);

  // 校門（閉ざされている）と、霧の向こうの校舎の影
  for (const side of [-1, 1]) b.box([-3.6, 0, ZO + side * 2.9 - 0.3], [-3.0, 1.9, ZO + side * 2.9 + 0.3], 'concrete');
  b.box([-3.4, 1.3, ZO - 2.6], [-3.3, 1.38, ZO + 2.6], 'rail');
  b.box([-3.4, 0.1, ZO - 2.6], [-3.3, 0.16, ZO + 2.6], 'rail');
  for (let z = ZO - 2.5; z <= ZO + 2.5; z += 0.3) b.box([-3.38, 0.1, z - 0.02], [-3.32, 1.36, z + 0.02], 'rail');
  b.collision.add(-4, ZO - 3.2, -3.0, ZO + 3.2);
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 1.2), new THREE.MeshLambertMaterial({ map: signTexture('夜見小学校') }));
  plate.rotation.y = -Math.PI / 2;
  plate.rotation.z = Math.PI / 2;
  plate.position.set(-2.99, 1.1, ZO + 2.9);
  b.add(plate);
  b.hitbox('gate', [-3.6, 0, ZO - 2.6], [-3.0, 1.9, ZO + 2.6]);
  b.box([-40, 0, ZO - 30], [-9, 14, ZO + 30], 'dark');

  // 道に落ちている十円玉
  coin(b, 'coin1', 20, ZO + 1.3);
  coin(b, 'coin2', 37.5, ZO - 1.6);
  coin(b, 'coin3', 63.5, ZO + 2.6);
}

function coin(b: WorldBuilder, id: string, x: number, z: number): void {
  const g = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: 0xa0602a, emissive: 0x301a08 });
  const m = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.012, 14), mat);
  m.position.y = 0.008;
  g.add(m);
  g.add(b.hitShape([0.5, 0.25, 0.5], [0, 0.05, 0]));
  // 目印：チカッ、チカッと二度光って、少し休む。霧の向こうからも、遠くても同じ大きさで見える
  const glint = new THREE.Sprite(new THREE.SpriteMaterial({ map: glintTexture(), color: 0xffe2a0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, sizeAttenuation: false }));
  glint.position.y = 0.06;
  g.add(glint);
  const offset = (x * 0.37) % 1.6;
  b.animations.push((time) => {
    const t = (time + offset) % 1.6;
    const on = t < 0.09 || (t > 0.22 && t < 0.31);
    glint.visible = on;
    glint.scale.setScalar(on ? 0.1 + Math.random() * 0.03 : 0.001);
    mat.emissive.setHex(on ? 0xc08040 : 0x301a08);
  });
  g.position.set(x, 0, z);
  b.interactable(id, g);
}

/** 光の十字（目印用） */
let glintTex: THREE.Texture | null = null;
function glintTexture(): THREE.Texture {
  if (glintTex) return glintTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 30);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,240,200,0.6)');
  g.addColorStop(1, 'rgba(255,220,150,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = 'rgba(255,255,240,0.9)';
  ctx.fillRect(30, 2, 4, 60);
  ctx.fillRect(2, 30, 60, 4);
  glintTex = new THREE.CanvasTexture(c);
  return glintTex;
}

/**
 * コンビニ：x 70〜80, z ZO-7〜ZO+7。入口は西（駐車場側）。
 * 北の壁沿いにレジカウンター、中央に二列の商品棚、東の壁に冷蔵ケース。
 */
function buildStore(b: WorldBuilder, lights: BuildContext['lights']): void {
  const x1 = 70;
  const x2 = 80;
  const z1 = ZO - 7;
  const z2 = ZO + 7;

  // 駐車場
  b.plane(60, ZO - 7.5, 70, ZO + 7.5, 0, 'asphalt');
  for (const z of [ZO - 6.5, ZO - 4, ZO + 4, ZO + 6.5]) b.box([62, 0, z - 0.05], [68, 0.006, z + 0.05], 'paint');
  b.collision.add(60, ZO - 7.8, 70, ZO - 7.5);
  b.collision.add(60, ZO + 7.5, 70, ZO + 7.8);
  b.collision.add(59.7, ZO - 7.8, 60, ZO - 2.6);
  b.collision.add(59.7, ZO + 2.6, 60, ZO + 7.8);
  b.plane(60, ZO - 16, 80, ZO - 7.5, 0, 'grass');
  b.plane(60, ZO + 7.5, 80, ZO + 16, 0, 'grass');

  // 建物
  b.plane(x1, z1, x2, z2, 0.003, 'storeFloor');
  b.plane(x1, z1, x2, z2, H, 'storeCeil', false);
  const front = [
    { from: z1 + 0.5, to: ZO - 1.3, bottom: 0.4, top: 2.6 },
    { from: ZO - 1.1, to: ZO + 1.1, top: 2.4 },
    { from: ZO + 1.3, to: z2 - 0.5, bottom: 0.4, top: 2.6 },
  ];
  b.wallZ(x1, z1, z2, 'storeWall', front, H + 0.9);
  b.wallZ(x2, z1, z2, 'storeWall', [], H + 0.9);
  b.wallX(z1, x1, x2, 'storeWall', [], H + 0.9);
  b.wallX(z2, x1, x2, 'storeWall', [], H + 0.9);
  b.box([x1 - 0.15, H + 0.85, z1 - 0.15], [x2 + 0.15, H + 0.95, z2 + 0.15], 'storeWall');
  // 窓：外からは光って見える
  for (const [f, t] of [
    [z1 + 0.5, ZO - 1.3],
    [ZO + 1.3, z2 - 0.5],
  ]) {
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(t - f, 2.2), b.mat('storeGlass'));
    pane.rotation.y = -Math.PI / 2;
    pane.position.set(x1, 1.5, (f + t) / 2);
    b.add(pane, f < ZO ? 'storeWindowN' : 'storeWindowS');
  }

  // 看板（霧の向こうからも見える）
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(12, 1.5), new THREE.MeshBasicMaterial({ map: storeSignTexture('ヨミマート'), fog: false }));
  sign.rotation.y = -Math.PI / 2;
  sign.position.set(x1 - 0.13, H + 0.42, ZO);
  b.add(sign, 'storeSign');

  // 自動ドア（左右に開く）
  for (const [name, side] of [
    ['storeDoorL', -1],
    ['storeDoorR', 1],
  ] as const) {
    const g = new THREE.Group();
    g.position.set(x1, 0, ZO + side * 0.55);
    const glass = new THREE.Mesh(new THREE.BoxGeometry(0.03, 2.35, 1.08), b.mat('doorGlass'));
    glass.position.y = 1.175;
    g.add(glass);
    for (const dz of [-0.53, 0.53]) {
      const edge = b.dynamicBox([0.05, 2.35, 0.04], [0, 1.175, dz], 'metal');
      g.add(edge);
    }
    b.add(g, name);
    b.openable(name, g, 0, 'storeDoorCol', [0, 0, side * 1.05]);
    b.openables.get(name)!.seconds = 0.5;
  }
  b.collision.add(x1 - 0.05, ZO - 1.1, x1 + 0.05, ZO + 1.1, 'storeDoorCol');
  b.hitbox('storeDoor', [x1 - 0.1, 0, ZO - 1.1], [x1 + 0.1, 2.35, ZO + 1.1]);

  // 店のきまり（入口のガラスに内側から貼ってある）
  b.interactable('storeRule', wallPlane(b, noticeTexture('storeRule', '深夜のお客様へ', ['一、お会計がお済みで', '　ないお客様は', '　お帰りになれません', '二、店員の顔は', '　見ないでください']), 0.5, 0.66, [x1 + 0.03, 1.5, ZO - 2.1], Math.PI / 2));

  // レジカウンターと店員。レジは東の端、店員は西の端に立っている
  // （レジの前で正面を向けば、店員の顔は視界の外になる）
  b.box([72, 0, z1 + 1.0], [78, 1.0, z1 + 1.8], 'counter', { collide: true });
  b.box([71.95, 1.0, z1 + 0.95], [78.05, 1.04, z1 + 1.85], 'shelf');
  b.box([77.05, 1.04, z1 + 1.1], [77.55, 1.28, z1 + 1.6], 'dark');
  b.box([77.1, 1.2, z1 + 1.58], [77.5, 1.27, z1 + 1.6], 'screen');
  b.hitbox('register', [76.7, 0.85, z1 + 1.0], [77.9, 1.32, z1 + 2.0]);
  b.collision.add(71, z1, 72, z1 + 1.8);
  // 後ろの棚（たばこ）
  b.box([72, 1.2, z1 + 0.08], [78, 2.4, z1 + 0.12], 'shelf');
  const packRows: GoodsRow[] = [];
  for (const y of [1.2, 1.5, 1.8, 2.1]) {
    b.box([72, y, z1 + 0.12], [78, y + 0.015, z1 + 0.32], 'shelf');
    packRows.push({ x1: 72, x2: 78, y: y + 0.015, front: z1 + 0.32, depthDir: -1, room: 0.25, kinds: ['pack'] });
  }
  fillShelves(b, packRows, 5);
  const clerk = ghostFigure({ hair: 0x161616, top: 0x5a5a7a, bottom: 0x22222a, opacity: 1, height: 1.75, hairStyle: 'short' });
  clerk.position.set(72.8, 0, z1 + 0.55);
  b.add(clerk, 'clerk');

  // 商品棚（二列）
  for (const z of [ZO - 2.0, ZO + 2.0]) {
    // 背中合わせの棚の仕切り板。棚板・値札レール・端の板・台輪で、ゴンドラ棚らしく
    b.box([72.55, 0.1, z - 0.02], [77.45, 1.5, z + 0.02], 'shelf');
    b.collision.add(72.5, z - 0.4, 77.5, z + 0.4);
    b.box([72.5, 0, z - 0.4], [77.5, 0.1, z + 0.4], 'dark');
    const levels = [0.1, 0.48, 0.86, 1.22];
    for (const y of levels) {
      b.box([72.5, y, z - 0.42], [77.5, y + 0.025, z + 0.42], 'shelf');
      for (const side of [-1, 1]) b.box([72.5, y + 0.025, z + side * 0.42 - 0.008], [77.5, y + 0.06, z + side * 0.42 + 0.008], 'porcelain');
    }
    // 両面に商品を並べる（下の段は大きな箱、上はお菓子・カップ麺など）
    const rows: GoodsRow[] = [];
    for (const side of [-1, 1] as const) {
      const faceZ = z + side * 0.4;
      const avoid = SALE.filter(([, , iz]) => Math.abs(iz - faceZ) < 0.3).map(([ix, iy]) => [ix, iy] as [number, number]);
      levels.forEach((y, i) => {
        const room = (levels[i + 1] ?? 1.5) - y - 0.06;
        const kinds: GoodsRow['kinds'] = i === 0 ? ['box'] : z < ZO ? (i === 3 ? ['box', 'cup'] : ['box', 'box', 'cup']) : ['cup', 'box'];
        rows.push({ x1: 72.5, x2: 77.5, y: y + 0.025, front: faceZ, depthDir: side > 0 ? -1 : 1, room, kinds, avoid });
      });
    }
    fillShelves(b, rows, z < ZO ? 11 : 12);
    // 一番上に並ぶ缶詰・保存食
    for (let x = 72.8; x < 77.3; x += 0.55) {
      b.prop(x % 1.1 < 0.55 ? 'russian_food_cans_01' : 'long_life_food', [x, 1.54, z + (z < ZO ? 0.15 : -0.15)], z < ZO ? 0 : Math.PI);
    }
  }
  // レジ横の電子レンジ、天井の防犯カメラ、奥の空きケース
  b.prop('vintage_microwave', [73.2, 1.04, z1 + 1.45], Math.PI, 0.55);
  b.prop('security_camera_01', [79.7, H - 0.05, z1 + 0.3], [0, -Math.PI * 0.75, 0], 1);
  for (const [cx, cy, cz, r] of [
    [79.0, 0, z2 - 0.5, 0.1],
    [79.0, 0.26, z2 - 0.5, -0.2],
    [78.6, 0, z2 - 0.5, 0.4],
  ]) b.prop('plastic_crate_01', [cx, cy, cz], r);
  b.collision.add(78.35, z2 - 0.75, 79.25, z2 - 0.25);
  // 冷蔵ケース（ガラス扉の中に飲み物）
  drinkCooler(b, 79.3, ZO - 5, ZO + 5, [[ZO + 1.0, 0.95]]);
  b.collision.add(79.25, ZO - 5, 80, ZO + 5);
  // 雑誌・新聞のラック（南西の窓際）
  b.box([70.2, 0, ZO + 2.2], [70.7, 0.9, ZO + 6.4], 'shelf', { collide: true });
  const paper = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.5), new THREE.MeshLambertMaterial({ map: newspaperTexture() }));
  paper.rotation.set(-Math.PI / 2 + 0.35, Math.PI / 2, 0, 'YXZ');
  paper.position.set(70.45, 0.95, ZO + 3.2);
  b.interactable('newspaper', paper);
  paper.add(b.hitShape([0.5, 0.6, 0.2], [0, 0, 0]));

  // 売り物（調べてカゴに入れる）。位置は SALE と同じ
  item(b, 'kiku', 71.3, 0, ZO + 2.1, 'bucket');
  for (const [x, y, z, id, color] of SALE) item(b, id, x, y, z, color);
  item(b, 'milk', 79.45, 0.915, ZO + 1.0, 0xffffff);

  // 店の明かり（ここだけは明るい）
  lights.addFluorescent(73, H - 0.06, ZO - 3, 'steady', 0, 5, 'store');
  lights.addFluorescent(77, H - 0.06, ZO + 3, 'steady', 0, 5, 'store');
  lights.addFluorescent(75.5, H - 0.06, z1 + 1.4, 'flicker', 0, 3, 'store');
  lights.addFluorescent(69.2, H - 0.05, ZO, 'steady', Math.PI / 2, 3, 'store');
}

/** 売り物。color は箱の色、'bucket' なら菊の花のバケツ */
/** 棚に置いてある売り物（x, 棚板の高さ, z）。棚の商品はこのまわりを空けて並べる */
const SALE: [number, number, number, string, number][] = [
  [73.6, 0.885, ZO - 1.7, 'manju', 0xd8c8a8],
  [76.4, 0.505, ZO - 1.7, 'senko', 0x5a7a4a],
  [73.6, 0.885, ZO + 1.7, 'onigiri', 0xf0f0f0],
  [76.4, 0.505, ZO + 1.7, 'candy', 0xe05a8a],
];

function item(b: WorldBuilder, id: string, x: number, y: number, z: number, color: number | 'bucket'): void {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  if (color === 'bucket') {
    const bucket = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.16, 0.4, 12), b.mat('metal'));
    bucket.position.y = 0.2;
    g.add(bucket);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      const stem = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.5, 0.015), new THREE.MeshLambertMaterial({ color: 0x3a5a2a }));
      stem.position.set(Math.cos(a) * 0.1, 0.55, Math.sin(a) * 0.1);
      g.add(stem);
      const flower = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), new THREE.MeshLambertMaterial({ color: i % 2 ? 0xf0f0e0 : 0xe8d050 }));
      flower.position.set(Math.cos(a) * 0.1, 0.82, Math.sin(a) * 0.1);
      g.add(flower);
    }
    g.add(b.hitShape([0.5, 1.0, 0.5], [0, 0.5, 0]));
  } else {
    const look = storeItemMesh(id as 'manju' | 'senko' | 'onigiri' | 'candy' | 'milk');
    // 冷蔵ケースの牛乳は、ガラス越しに手前（-x）を向ける
    if (id === 'milk') look.rotation.y = -Math.PI / 2;
    else if (z > ZO) look.rotation.y = Math.PI;
    g.add(look);
    g.add(b.hitShape([0.55, 0.3, 0.25], [0, 0.1, 0]));
  }
  b.interactable(id, g);
}

/** 駐車場に落ちているおつかいメモ */
function buildShoppingList(b: WorldBuilder): void {
  const memo = new THREE.Mesh(
    new THREE.PlaneGeometry(0.3, 0.22),
    new THREE.MeshLambertMaterial({ map: paperTexture('shoplist', ['おつかい', 'きくのはな', 'おせんこう', 'おまんじゅう', '　　はなこ']) }),
  );
  memo.rotation.x = -Math.PI / 2;
  memo.rotation.z = 0.4;
  memo.position.set(66.5, 0.008, ZO - 0.9);
  b.interactable('shoplist', memo);
  memo.add(b.hitShape([0.4, 0.3, 0.15], [0, 0, 0]));
}
