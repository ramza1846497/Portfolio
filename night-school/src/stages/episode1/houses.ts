import * as THREE from 'three';
import type { BuildContext } from '../../game/types';
import { calendarTexture, familyPhotoTexture, noticeTexture, paperTexture, signTexture, staticTexture } from '../../engine/textures';
import { ghostFigure, slidingDoor, wallPlane } from './parts';
import { chabudai, dialPhone, faucet, leggedTable, oldFridge, sofa, tansu } from './props';

/**
 * コンビニの先：花子さんの家（z = ZH）と、自分の家（z = ZM）。
 * どちらも別の場所に作り、teleport で移る。
 */
export const ZH = 230;
export const ZM = 300;

/** 民家の天井の高さ */
const HH = 2.5;

export function buildHouses(ctx: BuildContext): void {
  buildAlley(ctx);
  buildHanakoHouse(ctx);
  buildHomeStreet(ctx);
  buildHome(ctx);
}

/** 古い住宅街の路地：板塀に挟まれた一本道。突き当たりが花子さんの家 */
function buildAlley({ builder: b, lights }: BuildContext): void {
  b.plane(-2, ZH - 1.6, 24, ZH + 1.6, 0, 'asphalt');
  for (const side of [-1, 1]) {
    const z = ZH + side * 1.65;
    b.box([-2, 0, z - 0.05], [24, 1.8, z + 0.05], 'fence', { collide: true });
    // 塀の向こうの家々の影
    // （花子さんの家 x 24〜 に重ならないように）
    for (let x = -2; x < 18; x += 6) b.box([x + 0.5, 0, ZH + side * 3], [x + 5, 4.5 + ((x * 7) % 3), ZH + side * 9], 'roof');
  }
  b.collision.add(-2.5, ZH - 1.6, -2, ZH + 1.6);
  b.box([9.8, 0, ZH + 1.2], [10.1, 6, ZH + 1.5], 'pole');
  // 塀ぎわの古いごみ箱
  if (b.prop('metal_trash_can', [4.5, 0, ZH - 1.25], Math.PI, 0.9)) b.collision.add(3.7, ZH - 1.6, 5.3, ZH - 1.0);
  lights.addFluorescent(10, 4.2, ZH + 0.6, 'flicker', Math.PI / 2, 2.6);

  // 先へ先へと現れる花子さん
  const spots: [number, number][] = [
    [7, ZH - 0.2],
    [15.5, ZH + 0.4],
    [23.2, ZH - 0.3],
  ];
  spots.forEach(([x, z], i) => {
    const g = ghostFigure({ hair: 0x050505, top: 0xe8e8e0, bottom: 0x8a1010, opacity: 0.85 });
    g.position.set(x, 0, z);
    g.rotation.y = -Math.PI / 2;
    b.add(g, `hanakoLead${i + 1}`);
  });
  b.spawn('alleyStart', -1, ZH, -Math.PI / 2);
}

/**
 * 花子さんの家：x 24〜38, z ZH-6〜ZH+6。入口は西。
 *   北：居間（黒電話）・仏間（仏壇）  中央：廊下  南：台所（マッチ）・子供部屋
 */
function buildHanakoHouse({ builder: b, lights }: BuildContext): void {
  const x1 = 26;
  const x2 = 38;
  const zN = ZH - 6;
  const zS = ZH + 6;
  // 前庭と門
  b.plane(24, ZH - 3, x1, ZH + 3, 0, 'asphalt');
  for (const side of [-1, 1]) b.box([23.9, 0, ZH + side * 1.5 - 0.15], [24.2, 1.9, ZH + side * 1.5 + 0.15], 'wood', { collide: true });
  b.collision.add(23.9, ZH - 3, x1, ZH - 1.6);
  b.collision.add(23.9, ZH + 1.6, x1, ZH + 3);
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.25, 0.55), new THREE.MeshLambertMaterial({ map: signTexture('　') }));
  plate.rotation.y = -Math.PI / 2;
  plate.rotation.z = Math.PI / 2;
  plate.position.set(23.88, 1.4, ZH - 1.5);
  b.add(plate);
  b.hitbox('nameplate', [23.8, 1.1, ZH - 1.8], [24.0, 1.7, ZH - 1.2]);

  // 床・天井
  b.plane(x1, ZH - 0.9, x2, ZH + 0.9, 0.01, 'woodfloor');
  b.plane(x1, zN, 32, ZH - 0.9, 0.01, 'tatami');
  b.plane(32, zN, x2, ZH - 0.9, 0.01, 'tatami');
  b.plane(x1, ZH + 0.9, 32, zS, 0.01, 'woodfloor');
  b.plane(32, ZH + 0.9, x2, zS, 0.01, 'tatami');
  b.plane(x1, zN, x2, zS, HH, 'plaster', false);
  // 天井と屋根の下面が同じ高さだとちらつくので、屋根は少し浮かせる
  b.box([x1 - 0.3, HH + 0.02, zN - 0.3], [x2 + 0.3, HH + 0.6, zS + 0.3], 'roof');

  // 外壁（入口は西の中央）と、襖の間仕切り
  b.wallZ(x1, zN, zS, 'plaster', [{ from: ZH - 0.7, to: ZH + 0.7, top: 2.0 }], HH);
  b.wallZ(x2, zN, zS, 'plaster', [], HH);
  b.wallX(zN, x1, x2, 'plaster', [], HH);
  b.wallX(zS, x1, x2, 'plaster', [], HH);
  const door = (from: number) => ({ from, to: from + 1.0, top: 1.9 });
  b.wallX(ZH - 0.9, x1, x2, 'fusuma', [door(28.8), door(34)], HH, 0.08);
  b.wallX(ZH + 0.9, x1, x2, 'fusuma', [door(28.8), door(34)], HH, 0.08);
  b.wallZ(32, zN, ZH - 0.9, 'fusuma', [], HH, 0.08);
  b.wallZ(32, ZH + 0.9, zS, 'fusuma', [], HH, 0.08);

  // 仏間の襖（閉まっている）
  const fusuma = slidingDoor(b, 'butsumaDoor', 34, ZH - 0.9, 1.0, true);
  fusuma.children.forEach((c) => {
    if (c instanceof THREE.Mesh) c.material = b.mat('fusuma');
  });

  // 居間：ちゃぶ台と、箪笥の上の黒電話
  chabudai(b, 29.0, ZH - 3.5, 0.6);
  tansu(b, 26.1, 26.8, ZH - 5.4, ZH - 3.8, 0.75);
  const phone = new THREE.Group();
  phone.position.set(26.45, 0.75, ZH - 4.6);
  phone.add(dialPhone(0x0c0a0a));
  phone.add(b.hitShape([0.4, 0.35, 0.4], [0, 0.1, 0]));
  b.interactable('hanakoPhone', phone);
  lights.addFluorescent(29, HH - 0.05, ZH - 3.5, 'dim', 0, 2.2);

  // 仏間：仏壇と遺影
  b.box([37.1, 0, ZH - 4.4], [37.9, 1.7, ZH - 2.4], 'lacquer', { collide: true });
  b.box([37.08, 0.9, ZH - 4.2], [37.1, 1.6, ZH - 2.6], 'gold');
  b.box([36.75, 0.7, ZH - 4.3], [37.1, 0.75, ZH - 2.5], 'lacquer');
  b.hitbox('butsudan', [36.7, 0.6, ZH - 4.4], [37.9, 1.7, ZH - 2.4]);
  const portrait = wallPlane(b, familyPhotoTexture('ihai', 1, -1), 0.3, 0.24, [37.05, 1.35, ZH - 3.4], -Math.PI / 2);
  portrait.scale.set(0.9, 1.2, 1);
  // 供えた物（最初は見えない）
  const vase = new THREE.Group();
  vase.position.set(36.95, 0.75, ZH - 4.0);
  vase.add(b.dynamicBox([0.08, 0.16, 0.08], [0, 0.08, 0], 'gold'));
  for (let i = 0; i < 4; i++) {
    const f = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 5), new THREE.MeshLambertMaterial({ color: i % 2 ? 0xf0f0e0 : 0xe8d050 }));
    f.position.set((i - 1.5) * 0.03, 0.32, (i % 2) * 0.03);
    vase.add(f);
  }
  b.add(vase, 'altarKiku');
  const incense = new THREE.Group();
  incense.position.set(36.95, 0.75, ZH - 3.4);
  incense.add(b.dynamicBox([0.006, 0.18, 0.006], [0, 0.09, 0], 'dark'));
  const ember = new THREE.Mesh(new THREE.SphereGeometry(0.008, 6, 4), new THREE.MeshBasicMaterial({ color: 0xff5020 }));
  ember.position.y = 0.18;
  incense.add(ember);
  b.add(incense, 'altarSenko');
  const manju = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), new THREE.MeshLambertMaterial({ color: 0xece4d0 }));
  manju.scale.y = 0.6;
  manju.position.set(36.95, 0.79, ZH - 2.8);
  b.add(manju, 'altarManju');
  const thanks = ghostFigure({ hair: 0x050505, top: 0xe8e8e0, bottom: 0x8a1010, opacity: 0.7 });
  thanks.position.set(35.2, 0, ZH - 3.4);
  thanks.rotation.y = Math.PI / 2;
  b.add(thanks, 'hanakoThanks');
  lights.addFluorescent(35, HH - 0.05, ZH - 3.5, 'flicker', 0, 1.8, 'butsuma');

  // 台所：流しと、マッチの入った引き出し
  b.box([30.4, 0, ZH + 5.3], [31.9, 0.85, ZH + 5.95], 'counter', { collide: true });
  b.box([30.6, 0.86, ZH + 5.4], [31.2, 0.87, ZH + 5.85], 'glassDark');
  faucet(b, 30.9, 0.86, ZH + 5.9);
  oldFridge(b, 26.1, 26.8, ZH + 4.6, ZH + 5.9, 1.6);
  b.hitbox('kitchenDrawer', [30.3, 0.4, ZH + 5.1], [31.95, 0.9, ZH + 5.95]);
  leggedTable(b, 28.2, 29.4, ZH + 2.6, ZH + 3.6, 0.7);

  // 子供部屋：学習机とランドセル、止まったカレンダー
  tansu(b, 36.2, 36.6, ZH + 5.2, ZH + 5.9, 0.68);
  leggedTable(b, 36.2, 37.8, ZH + 5.2, ZH + 5.9, 0.72);
  b.prop('alarm_clock_01', [37.5, 0.72, ZH + 5.6], -Math.PI / 2);
  const bag = new THREE.Group();
  bag.position.set(36.7, 0.72, ZH + 5.5);
  bag.add(b.dynamicBox([0.3, 0.32, 0.2], [0, 0.16, 0], 'red'));
  bag.add(b.hitShape([0.45, 0.45, 0.35], [0, 0.18, 0]));
  b.interactable('randoseru', bag);
  b.interactable('calendarH', wallPlane(b, calendarTexture('hanako', 14, 'ピアノ'), 0.4, 0.5, [32.06, 1.5, ZH + 3.2], Math.PI / 2));
  lights.addFluorescent(35, HH - 0.05, ZH + 3.5, 'dead');

  b.spawn('hanakoHouseIn', 27.0, ZH, -Math.PI / 2);
}

/** 自分の家の前の道 */
function buildHomeStreet({ builder: b, lights }: BuildContext): void {
  b.plane(-2, ZM - 1.8, 12, ZM + 1.8, 0, 'asphalt');
  for (const side of [-1, 1]) {
    const z = ZM + side * 1.85;
    b.box([-2, 0, z - 0.05], [11, 1.4, z + 0.05], 'concrete', { collide: true });
    for (let x = -2; x < 7; x += 5) b.box([x + 0.3, 0, ZM + side * 3], [x + 4.6, 5, ZM + side * 9], 'roof');
  }
  b.collision.add(-2.5, ZM - 1.8, -2, ZM + 1.8);
  b.box([5, 0, ZM - 1.6], [5.25, 6, ZM - 1.35], 'pole');
  lights.addFluorescent(5.1, 4.2, ZM - 0.8, 'steady', Math.PI / 2, 2.6);
  b.spawn('homeStreet', -1, ZM, -Math.PI / 2);
}

/**
 * 自分の家：x 12〜24, z ZM-5〜ZM+5。入口は西。
 *   北：居間（テレビ・家族写真）・台所（「母」）  中央：廊下（電話）  南：自分の部屋・風呂場
 */
function buildHome({ builder: b, lights }: BuildContext): void {
  const x1 = 12;
  const x2 = 24;
  const zN = ZM - 5;
  const zS = ZM + 5;
  b.plane(11, ZM - 1.8, x1, ZM + 1.8, 0, 'asphalt');
  b.plane(x1, zN, x2, zS, 0.01, 'woodfloor');
  b.plane(x1, zN, x2, zS, HH, 'storeCeil', false);
  // 天井と屋根の下面が同じ高さだとちらつくので、屋根は少し浮かせる
  b.box([x1 - 0.3, HH + 0.02, zN - 0.3], [x2 + 0.3, HH + 0.6, zS + 0.3], 'roof');
  b.wallZ(x1, zN, zS, 'homeWall', [{ from: ZM - 0.6, to: ZM + 0.6, top: 2.0 }], HH);
  b.wallZ(x2, zN, zS, 'homeWall', [], HH);
  b.wallX(zN, x1, x2, 'homeWall', [], HH);
  b.wallX(zS, x1, x2, 'homeWall', [], HH);
  const door = (from: number) => ({ from, to: from + 1.0, top: 2.0 });
  b.wallX(ZM - 1, x1, x2, 'homeWall', [door(15), door(20)], HH, 0.1);
  b.wallX(ZM + 1, x1, x2, 'homeWall', [door(15), door(20)], HH, 0.1);
  b.wallZ(18, zN, ZM - 1, 'homeWall', [], HH, 0.1);
  b.wallZ(18, ZM + 1, zS, 'homeWall', [], HH, 0.1);

  // 玄関の扉（閉まっている）
  const front = new THREE.Group();
  front.position.set(x1, 0, ZM - 0.6);
  front.add(b.dynamicBox([0.05, 2.0, 1.2], [0, 1.0, 0.6], 'doorMetal'));
  front.add(b.dynamicBox([0.08, 0.05, 0.12], [-0.06, 1.0, 1.0], 'metal'));
  b.interactable('homeDoor', front);
  b.collision.add(x1 - 0.05, ZM - 0.6, x1 + 0.05, ZM + 0.6, 'homeDoordoor');
  b.openable('homeDoor', front, -1.5, 'homeDoordoor');

  // 下駄箱と、その上のメモ
  b.box([12.15, 0, ZM - 0.95], [13.6, 0.9, ZM - 0.7], 'wood', { collide: true });
  const memo = new THREE.Mesh(
    new THREE.PlaneGeometry(0.28, 0.2),
    new THREE.MeshLambertMaterial({ map: paperTexture('homeRule', ['おうちのきまり', 'ただいま　いわない', 'ごはんよ→いかない', 'おふとんで　ねない', 'でんわ→でる']) }),
  );
  memo.rotation.x = -Math.PI / 2;
  memo.position.set(12.9, 0.905, ZM - 0.82);
  b.interactable('homeMemo', memo);
  memo.add(b.hitShape([0.4, 0.3, 0.15], [0, 0, 0]));

  // 廊下の突き当たりの電話
  b.box([23.3, 0, ZM - 0.4], [23.85, 0.8, ZM + 0.4], 'wood', { collide: true });
  const phone = new THREE.Group();
  phone.position.set(23.55, 0.8, ZM);
  phone.rotation.y = Math.PI;
  phone.add(dialPhone(0xe6dcc6));
  phone.add(b.hitShape([0.45, 0.35, 0.45], [0, 0.1, 0]));
  b.interactable('homePhone', phone);

  // 居間：テレビ（砂嵐）・ソファ・家族写真
  b.box([12.3, 0, ZM - 3.6], [12.9, 0.5, ZM - 2.4], 'wood', { collide: true });
  b.box([12.35, 0.5, ZM - 3.45], [12.85, 1.0, ZM - 2.55], 'lacquer');
  const tvA = staticTexture(1, '七、知ってはいけない');
  const tvB = staticTexture(2);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.75, 0.42), new THREE.MeshBasicMaterial({ map: tvB }));
  screen.rotation.y = Math.PI / 2;
  screen.position.set(12.86, 0.75, ZM - 3.0);
  b.interactable('tv', screen);
  screen.add(b.hitShape([0.9, 0.6, 0.3], [0, 0, 0]));
  const screenMat = screen.material as THREE.MeshBasicMaterial;
  b.animations.push((t) => {
    // ときどき、砂嵐の奥に文字が浮かぶ
    const show = t % 4 < 0.6;
    screenMat.map = show ? tvA : Math.floor(t * 12) % 2 ? tvB : staticTexture(3);
  });
  sofa(b, 15.5, 17.5, ZM - 4.6, ZM - 3.8);
  b.interactable('familyPhoto', wallPlane(b, familyPhotoTexture('home', 3, 2), 0.5, 0.38, [15.0, 1.55, ZM - 4.88], 0));
  lights.addFluorescent(15, HH - 0.05, ZM - 3, 'dim', 0, 1.6);

  // 台所：流しに向かって立つ「母」
  b.box([18.3, 0, zN + 0.15], [23.8, 0.9, zN + 0.75], 'counter', { collide: true });
  leggedTable(b, 20.0, 21.6, ZM - 2.9, ZM - 2.1, 0.72);
  const motherBack = ghostFigure({ hair: 0x1a1612, top: 0x8a6a5a, bottom: 0x4a4a5a, opacity: 1, height: 1.62 });
  motherBack.position.set(21, 0, zN + 1.05);
  motherBack.rotation.y = Math.PI;
  b.add(motherBack, 'mother');
  const motherFront = ghostFigure({ hair: 0x1a1612, top: 0x8a6a5a, bottom: 0x4a4a5a, opacity: 1, height: 1.62 });
  motherFront.position.set(21, 0, zN + 1.05);
  b.add(motherFront, 'motherTurned');
  lights.addFluorescent(21, HH - 0.05, ZM - 3, 'flicker', 0, 1.8, 'kitchen');

  // 自分の部屋：ベッドと机
  if (b.prop('old_bed_frame', [13.2, 0, ZM + 4.03], Math.PI / 2, [0.95, 0.95, 1.0])) {
    b.collision.add(12.2, ZM + 3.2, 14.2, ZM + 4.85);
    b.box([12.3, 0.42, ZM + 3.6], [14.1, 0.5, ZM + 4.45], 'porcelain');
    b.box([12.3, 0.5, ZM + 3.55], [13.6, 0.58, ZM + 4.5], 'blanket');
  } else {
    b.box([12.2, 0, ZM + 3.2], [14.2, 0.45, ZM + 4.85], 'metalGray', { collide: true });
    b.box([12.25, 0.45, ZM + 3.25], [14.15, 0.6, ZM + 4.8], 'blanket');
  }
  b.hitbox('myBed', [12.2, 0.3, ZM + 3.2], [14.2, 0.8, ZM + 4.85]);
  leggedTable(b, 16.2, 17.8, ZM + 4.2, ZM + 4.85, 0.72);
  b.prop('desk_lamp_arm_01', [17.5, 0.72, ZM + 4.65], Math.PI, 0.6);
  b.box([16.6, 0.72, ZM + 4.4], [17.2, 0.75, ZM + 4.75], 'porcelain');
  // 風呂場の扉（開かない）
  b.box([20.0, 0, ZM + 1.04], [21.0, 2.0, ZM + 1.08], 'porcelain', { collide: true });
  b.hitbox('bathDoor', [19.9, 0, ZM + 1.0], [21.1, 2.0, ZM + 1.2]);
  wallPlane(b, noticeTexture('bath', '', ['']), 0.2, 0.08, [20.5, 1.7, ZM + 1.03], Math.PI).scale.y = 0.5;

  b.spawn('homeIn', 12.8, ZM, -Math.PI / 2);
}
