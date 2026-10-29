import * as THREE from 'three';
import type { BuildContext } from '../../game/types';
import { noticeTexture, signTexture } from '../../engine/textures';
import { pbrMaterial } from '../../world/pbr';
import { hedge, leafyTree } from './foliage';
import { mergeParts } from './figures';
import { ease, makeRig, wave, type Pose, type RigContext } from './rig';
import { OZ } from './floor1';
import { ghostFigure, moonPatch, notice, shadowChild, sign, slidingDoor, wallPlane } from './parts';

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
  // 天井板と屋根の下面が重なるとちらつくので、屋根は少し上に
  b.box([WX1 - 0.3, 2.72, ZW1], [WX2 + 0.3, 2.87, ZG1], 'roof');
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
  // 中庭に面した側は、窓の並ぶ校舎の外壁（二階建て）
  b.box([x1, 0, z1], [x2, 6, z1 + 0.03], 'facade');
  b.box([x1, 0, z1 + 0.03], [x1 + 0.03, 6, z2 - 0.1], 'facade');
  b.box([x1 + 0.03, 0, z2 - 0.13], [GX1, 6, z2 - 0.1], 'facade');
  // 屋上のふち
  b.box([x1 - 0.3, 6, z1 - 0.3], [x2, 6.25, z1 + 0.15], 'concrete');
  b.box([x1 - 0.3, 6, z1], [x1 + 0.15, 6.25, z2], 'concrete');
  // 夜空
  b.plane(x1 - 30, z1 - 30, x2 + 30, z2 + 30, 14, 'sky', false);
  // 台座
  b.box([11.0, 0, OZ + 14.4], [13.0, 0.18, OZ + 16.4], 'statueStone');
  b.box([11.2, 0.18, OZ + 14.6], [12.8, 1.0, OZ + 16.2], 'statueStone', { collide: true });
  b.box([11.1, 1.0, OZ + 14.5], [12.9, 1.08, OZ + 16.3], 'statueStone');
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
    leafyTree(b, x, z, Math.round(x * 7 + z));
  }
  // 校舎ぞいの植え込み
  for (let x = x1 + 1; x < x2 - 2; x += 1.6) {
    if (x > 9 && x < 15) continue;
    hedge(b, x, z1 + 0.6, 1.5, 0.9, 0.8, Math.round(x * 10));
  }
  moonPatch(b, 8, 16, OZ + 11, OZ + 19);
  lights.addFluorescent(3.0, 3.2, OZ + 15, 'dim', Math.PI / 2, 2.4);

  // 中庭の影たち
  const spots: [string, number, number][] = [
    ['shadow2', 23.4, OZ + 9.5],
    ['shadow3', 8, OZ + 13],
    ['shadow4', 16, OZ + 17.5],
  ];
  for (const [i, [id, x, z]] of spots.entries()) {
    const s = shadowChild(i + 5);
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

  // 壁ぎわの長椅子と、転がったボール
  for (const x of [12, 16, 28, 32]) if (b.prop('painted_wooden_bench', [x, 0, ZG1 + 0.45], 0)) b.collision.add(x - 0.58, ZG1 + 0.2, x + 0.58, ZG1 + 0.7);
  b.prop('football', [14.5, 0, ZG1 + 6.2], 0.7);
  b.prop('football', [30.2, 0, ZG2 - 6.8], 2.1);

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

/**
 * 二宮金次郎像：薪を背負い、本を読みながら歩く石像。原点は足元、正面は +z。
 * 人の形は ghostFigure（丸みのある体）を石の色で作り、本と背負子・薪を足す。
 */
export function ninomiyaStatue(): THREE.Group {
  const stone = 0x7a7a72;
  const g = ghostFigure({ hair: 0x6a6a62, top: stone, bottom: stone, opacity: 1, height: 1.95, skirt: true, hairStyle: 'short', arms: 'book', skin: stone, socks: stone, shoes: 0x6a6a62, stone: true, rig: true });
  const J = g.userData.joints as Record<string, THREE.Group>;
  const s = 1.95 / 1.25;
  const mat = pbrMaterial('statueStone', { color: 0xc8c8c0 });
  g.updateMatrixWorld(true);
  // 開いた本（両手で持って、のぞきこむ）：腕といっしょに動く
  const book = new THREE.Mesh(new THREE.BoxGeometry(0.2 * s, 0.015 * s, 0.14 * s), mat);
  book.position.set(0, 0.75 * s, 0.2 * s);
  book.rotation.x = -0.6;
  g.add(book);
  J.arms.attach(book);
  // 背負子と薪：背中（胴）といっしょに動く
  for (const x of [-0.1, 0.1]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.012 * s, 0.012 * s, 0.75 * s, 6), mat);
    post.position.set(x * s, 0.82 * s, -0.16 * s);
    g.add(post);
    J.torso.attach(post);
  }
  for (let i = 0; i < 7; i++) {
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.03 * s, 0.032 * s, 0.34 * s, 8), mat);
    log.rotation.z = Math.PI / 2 + (i % 2 ? 0.08 : -0.06);
    log.position.set(0, (0.78 + (i % 4) * 0.06) * s, (-0.2 - Math.floor(i / 4) * 0.06) * s);
    g.add(log);
    J.torso.attach(log);
  }
  // 目（構えると・怒ると赤く光る）
  const eyes = new THREE.MeshBasicMaterial({ color: 0x401010 });
  for (const x of [-0.035, 0.035]) {
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.025 * s, 0.01 * s, 0.01), eyes);
    eye.position.set(x * s, 1.045 * s, 0.093 * s);
    g.add(eye);
    J.neck.attach(eye);
  }
  const keep = new Set<THREE.Object3D>([J.neck, J.arms]);
  mergeParts(J.torso, keep);
  mergeParts(J.arms, new Set());
  const dim = new THREE.Color(0x401010);
  const hot = new THREE.Color(0xff3020);
  g.userData.rig = makeRig(g, J, (c) => statuePose(c, g.userData.rage === true), (c) => {
    const k = c.state === 'windupCharge' || c.state === 'windupStomp' || c.state === 'rage' ? 1 : g.userData.rage ? 0.5 + 0.2 * Math.sin(c.t * 3) : 0;
    eyes.color.copy(dim).lerp(hot, k);
  });
  g.userData.rig.update(0.016, 'idle');
  return g;
}

/**
 * 二宮金次郎像の姿勢。石の重さで、ゆっくり・ずしりと動く。
 *   待つ：本を読んでいる（首は下）。ときどき首だけがこちらへ回る
 *   追う：脚を棒のように振って歩き、顔を本から上げてこちらをにらむ（怒ると首が横に傾く）
 *   突進の構え：牛のように前かがみ、本を下げ、体が震える
 *   踏みつけの構え：片脚を高く上げ、本を頭上にかかげる → 踏みつけ
 *   気絶：上体がぐらり、ぐらりと揺れ、首が垂れる
 */
function statuePose(c: RigContext, rage: boolean): { pose: Pose; rate: number } {
  const t = c.t;
  const P: Pose = {};
  let rate = 3;
  const tilt = rage ? 0.45 + 0.08 * wave(t, 0.5) : 0.12 * wave(t, 0.3);
  switch (c.state) {
    case 'chase':
    case 'backoff':
    case 'recover': {
      const ph = c.walked * 2.3 * (c.state === 'backoff' ? -1 : 1);
      const go = Math.min(1, c.speed / 0.8);
      P.hipL = [0.42 * Math.sin(ph) * go, 0, 0];
      P.hipR = [-0.42 * Math.sin(ph) * go, 0, 0];
      P.torso = [0.1, 0.12 * Math.sin(ph) * go, 0.06 * Math.sin(ph) * go];
      P.arms = [0.08 * Math.sin(ph * 2) * go, 0, 0];
      P.neck = [-0.1 + 0.08 * wave(t, 0.4), 0.15 * wave(t, 0.25), tilt];
      rate = 5;
      break;
    }
    case 'windupCharge':
    case 'charge': {
      const shake = c.state === 'windupCharge' ? 0.03 * Math.sin(t * 23) : 0;
      const ph = c.walked * 2.8;
      const run = c.state === 'charge' ? 0.6 : 0;
      P.torso = [0.55, 0, shake];
      P.arms = [0.95, 0, 0];
      P.neck = [-0.6, 0, tilt];
      P.hipL = [-0.3 + run * Math.sin(ph), 0, 0];
      P.hipR = [0.35 - run * Math.sin(ph), 0, 0];
      rate = c.state === 'charge' ? 9 : 4;
      break;
    }
    case 'windupStomp': {
      const r = ease(c.inState / 0.5);
      P.hipR = [-1.15 * r, 0, 0];
      P.hipL = [0.1 * r, 0, 0];
      P.torso = [-0.18 * r, 0, -0.08 * r];
      P.arms = [-0.85 * r, 0, 0];
      P.neck = [-0.35, 0, tilt];
      rate = 5;
      break;
    }
    case 'slam':
      P.hipR = [0.15, 0, 0];
      P.torso = [0.4, 0, 0];
      P.arms = [0.35, 0, 0];
      P.neck = [0.1, 0, tilt];
      rate = 20;
      break;
    case 'stun':
      P.torso = [0.3, 0, 0.18 * Math.sin(t * 2.2)];
      P.neck = [0.6, 0, 0.4 * Math.sin(t * 1.7 + 1)];
      P.arms = [0.7, 0, 0];
      P.hipL = [0.05 * Math.sin(t * 2.2), 0, 0];
      rate = 3;
      break;
    case 'rage':
      P.torso = [-0.1, 0, 0.03 * Math.sin(t * 19)];
      P.neck = [-0.4, 0, 0.55];
      P.arms = [-0.45, 0, 0];
      rate = 3;
      break;
    case 'dying':
      P.torso = [0.5, 0, 0];
      P.neck = [0.8, 0, 0];
      P.arms = [1.0, 0, 0];
      rate = 2;
      break;
    default: {
      // 本を読んでいる。十数秒に一度、首だけがゆっくりこちらへ向く
      const cyc = (t % 14) / 14;
      const look = ease((cyc - 0.6) / 0.12) * (1 - ease((cyc - 0.88) / 0.08));
      P.neck = [0.4 - 0.5 * look, 0.08 * wave(t, 0.2), 0.3 * look];
      P.arms = [0.04 * wave(t, 0.3), 0, 0];
      P.torso = [0.03 * wave(t, 0.2), 0, 0];
    }
  }
  return { pose: P, rate };
}
