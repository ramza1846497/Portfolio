import * as THREE from 'three';
import type { BuildContext } from '../../game/types';
import type { WorldBuilder } from '../../world/builder';
import { fridgeTexture, newspaperTexture, noticeTexture, paperTexture, signTexture, storeSignTexture } from '../../engine/textures';
import { H, ghostFigure, wallPlane } from './parts';

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
    b.box([1, 0.55, z - 0.03], [58, 0.8, z + 0.03], 'rail');
    for (let x = 1; x <= 58; x += 2) b.box([x - 0.04, 0, z - 0.04], [x + 0.04, 0.78, z + 0.04], 'rail');
    b.collision.add(-4, z - 0.15, 60, z + 0.15);
  }

  // 電柱と街灯（ほとんど消えている）
  for (const x of [6, 18, 30, 42, 54]) {
    b.box([x - 0.13, 0, ZO + 3.3], [x + 0.13, 7.5, ZO + 3.56], 'pole');
    b.box([x - 0.5, 6.6, ZO + 3.38], [x + 0.5, 6.7, ZO + 3.48], 'pole');
    b.box([x - 0.05, 5.0, ZO + 2.0], [x + 0.05, 5.06, ZO + 3.4], 'pole');
  }
  // 電線
  for (const y of [6.66, 7.3]) b.box([-3, y, ZO + 3.42], [58, y + 0.02, ZO + 3.44], 'dark');
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
  const m = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.012, 14), new THREE.MeshLambertMaterial({ color: 0xa0602a, emissive: 0x301a08 }));
  m.position.y = 0.008;
  g.add(m);
  g.add(b.hitShape([0.5, 0.25, 0.5], [0, 0.05, 0]));
  g.position.set(x, 0, z);
  b.interactable(id, g);
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
  b.box([72, 1.2, z1 + 0.1], [78, 2.4, z1 + 0.4], 'goodsA');
  const clerk = ghostFigure({ hair: 0x161616, top: 0x5a5a7a, bottom: 0x22222a, opacity: 1, height: 1.75 });
  clerk.position.set(72.8, 0, z1 + 0.55);
  b.add(clerk, 'clerk');

  // 商品棚（二列）
  for (const z of [ZO - 2.0, ZO + 2.0]) {
    b.box([72.5, 0, z - 0.4], [77.5, 1.5, z + 0.4], z < ZO ? 'goodsA' : 'goodsB', { collide: true });
    b.box([72.45, 1.5, z - 0.42], [77.55, 1.54, z + 0.42], 'shelf');
  }
  // 冷蔵ケース
  b.box([79.3, 0, ZO - 5], [79.9, 2.2, ZO + 5], 'counter', { collide: true });
  const fridge = new THREE.Mesh(new THREE.PlaneGeometry(10, 2.0), new THREE.MeshBasicMaterial({ map: fridgeTexture() }));
  fridge.rotation.y = -Math.PI / 2;
  fridge.position.set(79.28, 1.05, ZO);
  b.add(fridge);
  // 雑誌・新聞のラック（南西の窓際）
  b.box([70.2, 0, ZO + 2.2], [70.7, 0.9, ZO + 6.4], 'shelf', { collide: true });
  const paper = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.5), new THREE.MeshLambertMaterial({ map: newspaperTexture() }));
  paper.rotation.set(-Math.PI / 2 + 0.35, Math.PI / 2, 0, 'YXZ');
  paper.position.set(70.45, 0.95, ZO + 3.2);
  b.interactable('newspaper', paper);
  paper.add(b.hitShape([0.5, 0.6, 0.2], [0, 0, 0]));

  // 売り物（調べてカゴに入れる）
  item(b, 'kiku', 71.3, 0, ZO + 2.1, 'bucket');
  item(b, 'manju', 73.6, 1.0, ZO - 1.55, 0xd8c8a8);
  item(b, 'senko', 76.4, 0.62, ZO - 1.55, 0x5a7a4a);
  item(b, 'onigiri', 73.6, 1.0, ZO + 1.55, 0xf0f0f0);
  item(b, 'candy', 76.4, 0.62, ZO + 1.55, 0xe05a8a);
  item(b, 'milk', 79.22, 1.2, ZO + 1.0, 0xffffff);

  // 店の明かり（ここだけは明るい）
  lights.addFluorescent(73, H - 0.06, ZO - 3, 'steady', 0, 5, 'store');
  lights.addFluorescent(77, H - 0.06, ZO + 3, 'steady', 0, 5, 'store');
  lights.addFluorescent(75.5, H - 0.06, z1 + 1.4, 'flicker', 0, 3, 'store');
  lights.addFluorescent(69.2, H - 0.05, ZO, 'steady', Math.PI / 2, 3, 'store');
}

/** 売り物。color は箱の色、'bucket' なら菊の花のバケツ */
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
    for (let i = 0; i < 3; i++) {
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.16, 0.1), new THREE.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: 0.08 }));
      box.position.set((i - 1) * 0.15, 0.08, 0);
      g.add(box);
    }
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
