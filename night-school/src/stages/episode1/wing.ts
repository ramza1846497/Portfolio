import * as THREE from 'three';
import type { BuildContext } from '../../game/types';
import { noticeTexture, signTexture } from '../../engine/textures';
import { OZ } from './floor1';
import { moonPatch, notice, shadowChild, sign, slidingDoor, wallPlane } from './parts';

/**
 * 1 階の南：渡り廊下・中庭・体育館。
 *
 *   1 階の廊下（z = OZ）
 *   ────────┤扉├────────
 *   中庭      │渡│
 *   （台座）  │り│
 *   ─────────┤廊├───
 *   │   体育館（扉）   │
 *   │  二宮金次郎像    │
 *   └──────舞台────────┘
 */
const WX1 = 22.4; // 渡り廊下の西の端
const WX2 = 24.4;
const ZW1 = OZ + 1.5; // 渡り廊下の北端（1 階の廊下）
const ZG1 = OZ + 21; // 体育館の北の壁
const ZG2 = OZ + 41;
const GX1 = 8;
const GX2 = 36;
const GH = 7;

export function buildWing(ctx: BuildContext): void {
  buildWalkway(ctx);
  buildCourtyard(ctx);
  buildGym(ctx);
}

/** 渡り廊下：屋根付き、西側は中庭に開いている（途中に出入り口） */
function buildWalkway({ builder: b, lights }: BuildContext): void {
  b.plane(WX1, ZW1, WX2, ZG1, 0.004, 'concrete');
  b.plane(WX1 - 0.2, ZW1, WX2 + 0.2, ZG1, 2.7, 'storeCeil', false);
  b.box([WX1 - 0.3, 2.7, ZW1], [WX2 + 0.3, 2.85, ZG1], 'roof');
  // 東側は壁
  b.box([WX2, 0, ZW1], [WX2 + 0.2, 2.7, ZG1], 'wall', { collide: true });
  // 西側：柱と手すり。中庭への出入り口だけ開いている
  const gapFrom = OZ + 11;
  const gapTo = OZ + 12.6;
  for (let z = ZW1 + 0.5; z < ZG1; z += 2.5) b.box([WX1 - 0.12, 0, z - 0.08], [WX1 + 0.04, 2.7, z + 0.08], 'pole');
  for (const [from, to] of [
    [ZW1 + 7.2, gapFrom],
    [gapTo, ZG1],
  ]) {
    b.box([WX1 - 0.08, 0.85, from], [WX1, 0.95, to], 'rail');
    b.collision.add(WX1 - 0.12, from, WX1 + 0.04, to);
  }
  // 北の端は保健室の裏の壁（中庭とのあいだ）
  b.collision.add(WX1 - 0.12, ZW1, WX1 + 0.04, ZW1 + 7.2);
  b.box([WX1 - 0.12, 0, ZW1], [WX1 + 0.04, 2.7, ZW1 + 7.2], 'wall');
  lights.addFluorescent(23.4, 2.62, OZ + 9, 'flicker', Math.PI / 2, 2.2);
  b.spawn('wingStart', 23.4, ZW1 + 1.2, Math.PI);
  // 言い伝えの貼り紙
  const n = notice(b, 'ninomiya', '学校のうわさ', ['二宮金次郎の像は', '夜になると', '台座をおりて', '校内を走りまわる'], [WX2 - 0.02, 1.5, OZ + 5], -Math.PI / 2, '#3a3a6a');
  b.interactable('rumorNotice', n);
}

/** 中庭：草地。真ん中に、像のいない台座 */
function buildCourtyard({ builder: b, lights }: BuildContext): void {
  const x1 = 2;
  const x2 = WX1;
  const z1 = OZ + 9.5;
  const z2 = ZG1;
  b.plane(x1, z1, x2, z2, 0, 'grass');
  // 四方を校舎の壁が囲む（北は保健室の裏、南は体育館）
  b.box([x1 - 0.3, 0, z1 - 0.3], [x2, 6, z1], 'wall', { collide: true });
  b.box([x1 - 0.3, 0, z1], [x1, 6, z2], 'wall', { collide: true });
  // 南：体育館の壁が始まる x=8 までのすき間をふさぐ
  b.box([x1 - 0.3, 0, z2 - 0.1], [GX1, 6, z2 + 0.2], 'wall', { collide: true });
  // 台座
  b.box([11.2, 0, OZ + 14.6], [12.8, 1.0, OZ + 16.2], 'concrete', { collide: true });
  b.box([11.1, 1.0, OZ + 14.5], [12.9, 1.08, OZ + 16.3], 'concrete');
  wallPlane(b, signTexture('勤勉'), 0.5, 0.19, [12, 0.6, OZ + 16.21], 0);
  b.hitbox('pedestal', [11.1, 0, OZ + 14.5], [12.9, 1.2, OZ + 16.3]);
  // 石の足跡（体育館の方へ）
  for (let i = 0; i < 6; i++) {
    const z = OZ + 16.8 + i * 0.7;
    b.box([12 + (i % 2 ? 0.15 : -0.15) - 0.1, 0.003, z], [12 + (i % 2 ? 0.15 : -0.15) + 0.1, 0.006, z + 0.28], 'dark');
  }
  // 木
  for (const [x, z] of [
    [5, OZ + 12],
    [18.5, OZ + 18],
    [4.5, OZ + 18.6],
  ]) {
    b.box([x - 0.15, 0, z - 0.15], [x + 0.15, 2.4, z + 0.15], 'wood', { collide: true });
    const leaves = new THREE.Mesh(new THREE.SphereGeometry(1.3, 8, 6), new THREE.MeshLambertMaterial({ color: 0x1a2a18 }));
    leaves.position.set(x, 3.2, z);
    b.add(leaves);
  }
  moonPatch(b, 8, 16, OZ + 11, OZ + 19);
  lights.addFluorescent(3.0, 3.2, OZ + 15, 'dim', Math.PI / 2, 2.4);

  // 中庭の影たち
  const spots: [string, number, number][] = [
    ['shadow2', 23.4, OZ + 9.5],
    ['shadow3', 8, OZ + 13],
    ['shadow4', 16, OZ + 17.5],
  ];
  for (const [id, x, z] of spots) {
    const s = shadowChild();
    s.position.set(x, 0, z);
    s.rotation.y = Math.PI;
    b.add(s, id);
  }
}

/** 体育館：広い板張り。南に舞台、その前に二宮金次郎像 */
function buildGym({ builder: b, lights }: BuildContext): void {
  b.plane(GX1, ZG1, GX2, ZG2, 0.004, 'woodfloor');
  b.plane(GX1, ZG1, GX2, ZG2, GH, 'ceiling', false);
  // 北の壁（渡り廊下からの扉）
  b.wallX(ZG1, GX1, GX2, 'wall', [{ from: WX1, to: WX2, top: 2.4 }], GH);
  b.wallX(ZG2, GX1, GX2, 'wall', [], GH);
  b.wallZ(GX1, ZG1, ZG2, 'wall', [], GH);
  b.wallZ(GX2, ZG1, ZG2, 'wall', [], GH);
  // 高窓
  for (let x = GX1 + 2; x < GX2 - 2; x += 4) {
    const w = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.2), b.mat('night'));
    w.position.set(x + 1.2, 5.6, ZG1 + 0.11);
    b.add(w);
  }
  moonPatch(b, 12, 32, ZG1 + 2, ZG1 + 6);
  // コートの線
  for (const z of [ZG1 + 3, ZG2 - 5]) b.box([GX1 + 2, 0.005, z - 0.04], [GX2 - 2, 0.008, z + 0.04], 'paint');
  for (const x of [GX1 + 2, GX2 - 2, (GX1 + GX2) / 2]) b.box([x - 0.04, 0.005, ZG1 + 3], [x + 0.04, 0.008, ZG2 - 5], 'paint');
  // バスケットゴール
  for (const [x, dir] of [
    [GX1 + 0.2, 1],
    [GX2 - 0.2, -1],
  ] as const) {
    b.box([x, 2.8, ZG1 + 9.2], [x + dir * 0.1, 3.8, ZG1 + 10.8], 'porcelain');
    b.box([x + dir * 0.1, 3.0, ZG1 + 9.9], [x + dir * 0.55, 3.03, ZG1 + 10.1], 'red');
  }
  // 舞台（上がれない）と緞帳
  b.box([GX1, 0, ZG2 - 4], [GX2, 1.0, ZG2], 'wood', { collide: true });
  b.box([GX1 + 3, 1.0, ZG2 - 1.2], [GX2 - 3, GH - 1.5, ZG2 - 1.0], 'red');
  sign(b, '体育館', 23.4, 2.75, ZG1 - 0.12, Math.PI, 0.9);

  // 扉（体育館の鍵で開く）
  const door = slidingDoor(b, 'gymDoor', WX1, ZG1, WX2 - WX1, true);
  door.children.forEach((c) => {
    if (c instanceof THREE.Mesh) c.material = b.mat('doorMetal');
  });

  // 二宮金次郎像（中ボス）
  const statue = ninomiyaStatue();
  statue.position.set(22, 0, ZG2 - 5.2);
  statue.rotation.y = Math.PI;
  b.add(statue, 'ninomiya');
  wallPlane(b, noticeTexture('gymRule', '体育館の使い方', ['使ったボールは', 'かたづけること', '', '夜間は', '立入禁止']), 0.5, 0.66, [GX1 + 0.12, 1.5, ZG1 + 4], Math.PI / 2);

  // 天井から吊るした照明
  lights.addFluorescent(16, 4.6, ZG1 + 10, 'dim', 0, 6, 'gym');
  lights.addFluorescent(28, 4.6, ZG1 + 10, 'flicker', 0, 6, 'gym');
  lights.addFluorescent(22, 4.6, ZG2 - 7, 'dim', 0, 6, 'gym');
  b.spawn('gymIn', 23.4, ZG1 + 1.5, Math.PI);
}

/** 二宮金次郎像：薪を背負い、本を読みながら歩く石像。原点は足元、正面は +z */
function ninomiyaStatue(): THREE.Group {
  const g = new THREE.Group();
  const stone = () => new THREE.MeshLambertMaterial({ color: 0x7a7a72 });
  const part = (w: number, h: number, d: number, x: number, y: number, z: number) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), stone());
    m.position.set(x, y, z);
    g.add(m);
    return m;
  };
  const s = 1.25; // 子どもの像だが、大きい
  part(0.16 * s, 0.75 * s, 0.18 * s, -0.11 * s, 0.38 * s, 0);
  part(0.16 * s, 0.75 * s, 0.18 * s, 0.11 * s, 0.38 * s, 0);
  part(0.46 * s, 0.6 * s, 0.3 * s, 0, 1.05 * s, 0);
  part(0.12 * s, 0.5 * s, 0.12 * s, -0.27 * s, 1.05 * s, 0.12 * s);
  part(0.12 * s, 0.5 * s, 0.12 * s, 0.27 * s, 1.05 * s, 0.12 * s);
  part(0.28 * s, 0.3 * s, 0.28 * s, 0, 1.55 * s, 0.02 * s);
  // 開いた本
  part(0.34 * s, 0.03 * s, 0.24 * s, 0, 1.22 * s, 0.32 * s).rotation.x = -0.5;
  // 背中の薪
  for (let i = 0; i < 5; i++) {
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.05 * s, 0.05 * s, 0.9 * s, 6), stone());
    log.position.set((i - 2) * 0.1 * s, 1.3 * s, -0.26 * s);
    g.add(log);
  }
  // 目（暴れると赤く光る）
  const eyes = new THREE.MeshBasicMaterial({ color: 0x401010 });
  for (const x of [-0.06, 0.06]) {
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.04 * s, 0.02 * s, 0.01), eyes);
    eye.position.set(x * s, 1.58 * s, 0.155 * s);
    g.add(eye);
  }
  return g;
}

