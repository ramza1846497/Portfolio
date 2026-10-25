import * as THREE from 'three';
import type { BuildContext } from '../../game/types';
import type { WorldBuilder } from '../../world/builder';
import { noticeTexture, paperTexture } from '../../engine/textures';
import {
  H,
  anatomyModel,
  blackboard,
  doorOpening,
  labTable,
  moonPatch,
  notice,
  officeDesk,
  roomPlate,
  roomShell,
  sign,
  slidingDoor,
  stairwell,
  wallPlane,
  windowOpening,
  windowPane,
} from './parts';

/**
 * 1 階は 2 階と重ならないよう、z を OZ だけずらした場所に作る
 * （明かりが床を突き抜けて別の階を照らさないように）。
 */
export const OZ = 60;

/**
 * 校舎 1 階（z = OZ 付近）。
 *
 *   北
 *   ┌─────────────┬────────────┬────────────┬──────┐
 *   │             │  理科室     │  職員室     │      │
 *   │西階段 ├──────┴─扉──────扉─┴─扉──────扉─┴──────┤
 *   │(上り)      廊下 (x: 0〜44)                     │
 *   │      ├─保健室─┤                   ├─昇降口ホール─┤
 *   └──────┴────────┴───────────────────┤ 下駄箱      │
 *                                        └──出口──────┘
 *   南
 */
export function buildFloor1({ builder: b, lights }: BuildContext): void {
  const zN = OZ - 1.5;
  const zS = OZ + 1.5;

  // ---------------- 廊下 ----------------
  b.plane(0, zN, 44, zS, 0, 'floor');
  b.plane(0, zN, 44, zS, H, 'ceiling', false);
  b.wallX(zN, -3.4, 44, 'wall', [doorOpening(15.0), doorOpening(24.2), doorOpening(29.0), doorOpening(38.2)]);
  const southWindows: [number, number][] = [
    [2.2, 4.4],
    [5.2, 7.4],
    [19, 21.4],
    [22.2, 24.6],
    [25.4, 27.8],
    [28.6, 31],
  ];
  const hall = { from: 32.4, to: 43.6, top: 2.4 };
  b.wallX(zS - 0.05, -3.4, 44, 'wall', [...southWindows.map(([f, t]) => windowOpening(f, t)), doorOpening(12.4), hall], H, 0.1);
  for (const [f, t] of southWindows) windowPane(b, 'x', zS, f, t, 0.9, 2.4, -1);
  b.wallZ(44, zN, OZ + 10, 'wall');

  stairwell(b, OZ, false);
  b.hitbox('stairs1f', [-3.2, 0, OZ - 1.35], [0.1, 2.6, OZ + 1.35]);
  sign(b, '西階段', 0.4, 2.65, zN + 0.12, 0, 0.6);

  // 保健室（職員室の引き出しの鍵で開く）
  slidingDoor(b, 'nurseDoor', 12.4, zS - 0.05, 1.2, true);
  sign(b, '保健室', 13.0, 2.45, zS - 0.12, Math.PI, 0.7);

  lights.addFluorescent(6, H - 0.08, OZ, 'flicker');
  lights.addFluorescent(14, H - 0.08, OZ, 'dead');
  lights.addFluorescent(22, H - 0.08, OZ, 'dim', 0, 3);
  lights.addFluorescent(31, H - 0.08, OZ, 'dead');
  lights.addFluorescent(38, H - 0.08, OZ, 'steady', 0, 2.5);

  buildScience(b, lights);
  buildStaffRoom(b, lights);
  buildNurseRoom(b, lights);
  buildEntrance(b, lights);

  b.spawn('f1Stairs', 1.0, OZ, -Math.PI / 2);
  b.spawn('nurseOut', 13.0, OZ + 0.4, Math.PI);
}

/** 理科室：x 14〜26。奥（北東）の隅に人体模型 */
function buildScience(b: WorldBuilder, lights: BuildContext['lights']): void {
  const zFar = OZ - 9.5;
  const zNear = OZ - 1.5;
  roomShell(b, 14, 26, zFar, zNear);
  roomPlate(b, '理科室', 15.6, zNear, 1);
  blackboard(b, 'blackboardScience', 'science', ['てこの原理', '支点・力点・作用点', '　　　　　　（自習）'], 14, OZ - 5.5, 1);
  for (const x of [17.6, 21.6]) for (const z of [OZ - 7, OZ - 4]) labTable(b, x, z);

  const notes = notice(b, 'scirule', '理科室のきまり', ['一、薬品にさわらない', '二、走らない', '三、人体模型から', '　　目をはなさない', '四、……'], [19.6, 1.6, zNear - 0.115], Math.PI);
  b.interactable('scienceRule', notes);

  // 棚の標本びん
  b.box([25.4, 0, OZ - 6.8], [25.9, 1.8, OZ - 3.2], 'wood', { collide: true });
  for (let i = 0; i < 6; i++) {
    const z = OZ - 6.5 + i * 0.55;
    b.box([25.5, 1.0, z], [25.75, 1.25, z + 0.25], 'glassDark');
    b.box([25.5, 1.45, z + 0.1], [25.75, 1.68, z + 0.3], 'porcelain');
  }
  b.hitbox('specimens', [25.3, 0.9, OZ - 6.8], [25.9, 1.8, OZ - 3.2]);

  const model = anatomyModel(b);
  model.root.position.set(24.6, 0, OZ - 8.4);
  model.root.rotation.y = -Math.PI / 4;
  b.interactable('model', model.root);
  b.named.set('modelHeart', model.heart);
  b.named.set('modelKey', model.keyInHand);

  lights.addFluorescent(20, H - 0.08, OZ - 5.5, 'flicker', Math.PI / 2, 2.6);
}

/** 職員室：x 28〜40。落とし物箱・宿直日誌・鍵の保管箱 */
function buildStaffRoom(b: WorldBuilder, lights: BuildContext['lights']): void {
  const zFar = OZ - 9.5;
  const zNear = OZ - 1.5;
  roomShell(b, 28, 40, zFar, zNear, 'floor');
  roomPlate(b, '職員室', 29.6, zNear, 1);
  for (const x of [31.0, 32.2, 35.6, 36.8]) {
    for (const z of [OZ - 6.4, OZ - 5.7]) officeDesk(b, x, z, (x * 7 + z) % 3 < 1.5);
  }
  // 宿直日誌
  const journal = new THREE.Mesh(
    new THREE.PlaneGeometry(0.34, 0.25),
    new THREE.MeshLambertMaterial({ map: paperTexture('journal', ['宿直日誌', '', '○月○日', '人体模型の……']) }),
  );
  journal.rotation.x = -Math.PI / 2;
  journal.rotation.z = 0.15;
  journal.position.set(32.2, 0.735, OZ - 5.6);
  b.interactable('journal', journal);

  // 落とし物箱（キャビネットの上）と、その中の心臓
  b.box([39.2, 0, OZ - 8.6], [39.9, 0.9, OZ - 7.2], 'metalGray', { collide: true });
  b.box([39.3, 0.9, OZ - 8.3], [39.8, 0.94, OZ - 7.5], 'wood');
  b.box([39.3, 0.94, OZ - 8.3], [39.32, 1.2, OZ - 7.5], 'wood');
  b.box([39.78, 0.94, OZ - 8.3], [39.8, 1.2, OZ - 7.5], 'wood');
  b.box([39.3, 0.94, OZ - 8.3], [39.8, 1.2, OZ - 8.28], 'wood');
  b.box([39.3, 0.94, OZ - 7.52], [39.8, 1.2, OZ - 7.5], 'wood');
  const label = wallPlane(b, noticeTexture('lost', '落とし物', ['']), 0.3, 0.2, [39.29, 1.07, OZ - 7.9], -Math.PI / 2);
  label.scale.y = 0.5;
  b.hitbox('lostbox', [39.2, 0.8, OZ - 8.4], [39.9, 1.3, OZ - 7.4]);
  const heart = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), new THREE.MeshLambertMaterial({ color: 0x9a1a1a, emissive: 0x2a0505 }));
  heart.scale.set(1, 1.2, 0.85);
  heart.position.set(39.55, 1.02, OZ - 7.9);
  b.add(heart, 'heartObj');

  // 鍵の保管箱（西の壁）
  b.box([28.1, 1.3, OZ - 4.6], [28.18, 1.9, OZ - 3.8], 'metalGray');
  wallPlane(b, noticeTexture('keybox', '鍵', ['理科室　　○', '職員室　　○', '音楽室　　－', '女子便所　－', '昇降口　　－']), 0.55, 0.7, [28.19, 1.6, OZ - 4.2], Math.PI / 2);
  b.hitbox('keybox', [28.1, 1.2, OZ - 4.7], [28.4, 2.0, OZ - 3.7]);

  // 保健の先生の机：引き出しに四桁のダイヤル錠
  officeDesk(b, 38.6, OZ - 4.9, false);
  wallPlane(b, noticeTexture('nursePlate', '保健', ['']), 0.24, 0.12, [38.6, 0.85, OZ - 4.9 + 0.38], 0).scale.y = 0.6;
  b.box([38.35, 0.45, OZ - 4.54], [38.85, 0.62, OZ - 4.52], 'dark');
  b.box([38.55, 0.5, OZ - 4.52], [38.65, 0.57, OZ - 4.49], 'metal');
  b.hitbox('nurseDrawer', [38.0, 0.3, OZ - 5.3], [39.2, 0.8, OZ - 4.5]);

  lights.addFluorescent(34, H - 0.08, OZ - 5.5, 'dim', Math.PI / 2, 2.2);
}

/**
 * 保健室：x 11〜18, z OZ+1.5〜OZ+8.5（廊下の南側）。
 * 奥のベッドだけカーテンが閉まっていて、誰かが眠っている。
 */
function buildNurseRoom(b: WorldBuilder, lights: BuildContext['lights']): void {
  const x1 = 11;
  const x2 = 18;
  const z1 = OZ + 1.5;
  const z2 = OZ + 8.5;
  b.plane(x1, z1, x2, z2, 0, 'tilefloor');
  b.plane(x1, z1, x2, z2, H, 'ceiling', false);
  b.wallZ(x1, z1, z2, 'wall');
  b.wallZ(x2, z1, z2, 'wall');
  b.wallX(z2, x1, x2, 'wall', [{ from: 13.2, to: 15.4, bottom: 0.9, top: 2.4 }]);
  windowPane(b, 'x', z2 + 0.06, 13.2, 15.4, 0.9, 2.4, -1);
  moonPatch(b, 13.0, 15.2, z2 - 2.4, z2 - 0.2);

  // 手前のベッド（空）
  bed(b, z1 + 1.5);
  b.hitbox('bedEmpty', [16.0, 0, z1 + 1.0], [17.9, 0.8, z1 + 2.0]);

  // 奥のベッド：カーテンで囲まれている
  const bz = z1 + 4.6;
  bed(b, bz);
  const curtainMat = 'curtain';
  b.box([15.75, 0.35, bz - 1.2], [17.9, 2.1, bz - 1.17], curtainMat);
  b.box([15.75, 0.35, bz + 1.17], [17.9, 2.1, bz + 1.2], curtainMat);
  b.box([15.7, 2.1, bz - 1.2], [15.76, 2.14, bz + 1.2], 'metal');
  b.collision.add(15.7, bz - 1.2, 17.9, bz + 1.2);
  const front = new THREE.Group();
  front.position.set(15.76, 0, bz - 1.17);
  front.add(b.dynamicBox([0.03, 1.75, 2.34], [0, 1.225, 1.17], b.mat(curtainMat)));
  b.interactable('bedCurtain', front);
  b.openable('bedCurtain', front, 0, undefined, [0, 0, -1.9]);
  // 眠っている人：頭まで布団をかぶり、短い黒髪だけが見える
  b.box([16.15, 0.5, bz - 0.36], [17.45, 0.72, bz + 0.36], 'blanket');
  b.box([17.35, 0.5, bz - 0.13], [17.62, 0.7, bz + 0.13], 'dark');
  b.hitbox('sleeper', [16.1, 0.4, bz - 0.4], [17.7, 0.8, bz + 0.4]);

  // 先生の机・薬品棚・体重計
  b.box([11.2, 0, z1 + 1.2], [12.0, 0.72, z1 + 2.6], 'wood', { collide: true });
  b.box([11.1, 0, z1 + 4.0], [11.55, 1.9, z1 + 6.2], 'locker', { collide: true });
  b.box([11.56, 0.9, z1 + 4.1], [11.57, 1.8, z1 + 6.1], 'glassDark');
  b.hitbox('medicine', [11.1, 0.8, z1 + 4.0], [11.7, 1.9, z1 + 6.2]);
  b.box([12.6, 0, z1 + 6.6], [13.0, 0.08, z1 + 7.0], 'metal');
  notice(b, 'nurserule', '保健室では', ['しずかに', '', 'ねている人を', 'おこさないこと'], [x1 + 0.12, 1.5, z1 + 3.2], Math.PI / 2, '#1a5a3a');

  // 床に落ちた紙切れ（理科室のきまりの破れた四番）
  const torn = new THREE.Mesh(
    new THREE.PlaneGeometry(0.3, 0.2),
    new THREE.MeshLambertMaterial({ map: paperTexture('torn', ['四、ほけん室で', 'ねている子を', 'おこさないこと']) }),
  );
  torn.rotation.x = -Math.PI / 2;
  torn.rotation.z = 0.5;
  torn.position.set(13.4, 0.006, z1 + 1.3);
  b.interactable('tornRule', torn);
  torn.add(b.hitShape([0.4, 0.3, 0.12], [0, 0, 0]));

  lights.addFluorescent(14.5, H - 0.08, z1 + 3.5, 'dim', Math.PI / 2, 1.8);
}

/** 保健室のベッド（頭が東側） */
function bed(b: WorldBuilder, z: number): void {
  b.box([16.0, 0, z - 0.45], [17.9, 0.42, z + 0.45], 'metalGray', { collide: true });
  b.box([16.02, 0.42, z - 0.43], [17.88, 0.5, z + 0.43], 'porcelain');
  b.box([17.45, 0.5, z - 0.3], [17.85, 0.6, z + 0.3], 'porcelain');
  b.box([17.88, 0, z - 0.45], [17.92, 0.9, z + 0.45], 'metal');
}

/** 昇降口ホール：x 32〜44, z OZ+1.5〜OZ+10。下駄箱と、施錠された出口 */
function buildEntrance(b: WorldBuilder, lights: BuildContext['lights']): void {
  const z1 = OZ + 1.5;
  const z2 = OZ + 10;
  b.plane(32, z1, 44, z2, 0, 'floor');
  b.plane(32, z1, 44, z2, H, 'ceiling', false);
  b.wallZ(32, z1, z2, 'wall');
  b.wallX(z2, 32, 44, 'wall', [{ from: 36.6, to: 39.4, top: 2.4 }]);

  // 下駄箱（中央は出口への通路）
  for (const z of [OZ + 4.2, OZ + 6.9]) {
    for (const [x1, x2] of [
      [32.4, 36.0],
      [40.0, 43.6],
    ]) {
      b.box([x1, 0, z - 0.2], [x2, 1.8, z + 0.2], 'cubby', { collide: true });
      b.box([x1, 1.8, z - 0.22], [x2, 1.84, z + 0.22], 'wood');
    }
  }
  b.hitbox('shoes', [32.4, 0, OZ + 4.0], [36.0, 1.8, OZ + 4.4]);

  // 出口のガラス扉（鎖と南京錠）
  const exit = new THREE.Group();
  for (const side of [-1, 1]) {
    const cx = 38 + side * 0.7;
    exit.add(b.dynamicBox([1.36, 2.4, 0.06], [cx, 1.2, z2 - 0.14], 'doorMetal'));
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 1.6), b.mat('night'));
    glass.rotation.y = Math.PI;
    glass.position.set(cx, 1.35, z2 - 0.175);
    exit.add(glass);
  }
  exit.add(b.dynamicBox([0.5, 0.04, 0.04], [38, 1.05, z2 - 0.2], 'metal'));
  exit.add(b.dynamicBox([0.1, 0.14, 0.06], [38, 0.95, z2 - 0.21], 'metal'));
  exit.add(b.hitShape([2.8, 2.4, 0.12], [38, 1.2, z2 - 0.15]));
  b.interactable('exit', exit);
  b.collision.add(36.6, z2 - 0.25, 39.4, z2);
  sign(b, '昇降口', 38, 2.68, z2 - 0.12, Math.PI, 1.0);
  moonPatch(b, 36.8, 39.2, z2 - 2.6, z2 - 0.3);

  lights.addFluorescent(38, H - 0.08, OZ + 5.5, 'dim', Math.PI / 2, 2.2);
}

/**
 * 人体模型が歩く経路（1 階）。壁を挟まない点どうしをつなぐ。
 */
export const NAV_1F: { nodes: [number, number][]; edges: [number, number][] } = (() => {
  const nodes: [number, number][] = [
    [2, OZ], // 0
    [8, OZ], // 1
    [15.6, OZ], // 2
    [20, OZ], // 3
    [24.8, OZ], // 4
    [29.6, OZ], // 5
    [34, OZ], // 6
    [38.8, OZ], // 7
    [42, OZ], // 8
    [15.6, OZ - 2.3], // 9  理科室 前扉の内側
    [24.8, OZ - 2.3], // 10 理科室 後扉の内側
    [24.3, OZ - 8.0], // 11 人体模型の定位置
    [19.6, OZ - 5.5], // 12 理科室の中央通路
    [29.6, OZ - 2.4], // 13 職員室 前扉の内側
    [38.8, OZ - 2.4], // 14 職員室 後扉の内側
    [34, OZ - 3.6], // 15 職員室の中央
    [38, OZ + 3.0], // 16 昇降口ホール
    [38, OZ + 8.4], // 17 出口の前
    [19.6, OZ - 2.3], // 18 理科室 廊下側の通路
    [13.0, OZ], // 19 保健室の前
    [13.0, OZ + 2.4], // 20 保健室の中
  ];
  const edges: [number, number][] = [
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 4],
    [4, 5],
    [5, 6],
    [6, 7],
    [7, 8],
    [2, 9],
    [4, 10],
    [10, 11],
    [9, 18],
    [18, 10],
    [18, 12],
    [5, 13],
    [7, 14],
    [13, 15],
    [14, 15],
    [6, 16],
    [7, 16],
    [16, 17],
    [1, 19],
    [19, 2],
    [19, 20],
  ];
  return { nodes, edges };
})();
