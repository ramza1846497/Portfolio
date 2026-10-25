import * as THREE from 'three';
import type { BuildContext } from '../../game/types';
import type { Opening, WorldBuilder } from '../../world/builder';
import { blackboardTexture, bulletinTexture, paperTexture, signTexture } from '../../engine/textures';

/**
 * 第一話の舞台：校舎 2 階。
 *
 *   北 (-z)
 *   ┌──────────┬─────────┬─────────┬──────────┐
 *   │          │  2-B    │  2-A    │  掲示板  │
 *   │階段 机   ├─扉───扉─┴─扉───扉─┴──────────┤昇
 *   │  ■■   廊下 (x: 0〜44, z: -1.4〜1.4)       │降
 *   │     ├──女子トイレ──┤                     │口
 *   └─────┴──────────────┴─────────────────────┘
 *   南 (+z)        西 (x=0) ← → 東 (x=44)
 */

const H = 3;

export function buildHanakoMap({ builder: b, lights }: BuildContext): void {
  const { collision } = b;

  // ---------------- 廊下 ----------------
  b.plane(0, -1.5, 44, 1.5, 0, 'floor');
  b.plane(-3.4, -1.5, 44, 1.5, H, 'ceiling', false);

  // 北側の壁（教室の扉）
  const door = (from: number): Opening => ({ from, to: from + 1.2, top: 2.1 });
  b.wallX(-1.5, -3.4, 44, 'wall', [door(15.6), door(22.4), door(25.6), door(32.4)]);

  // 南側の壁（窓とトイレの入口）。トイレ側はタイルを貼るので 2 枚重ね
  const win = (from: number, to: number): Opening => ({ from, to, bottom: 0.9, top: 2.4 });
  const southWindows: [number, number][] = [
    [2.2, 4.4],
    [5.2, 7.4],
    [17, 19.4],
    [20.4, 22.8],
    [24, 26.4],
    [27.4, 29.8],
    [31, 33.4],
    [34.4, 36.8],
    [38, 40.4],
    [41.4, 43.4],
  ];
  const toiletDoor: Opening = { from: 13.8, to: 15.0, top: 2.1 };
  b.wallX(1.45, -3.4, 44, 'wall', [...southWindows.map(([f, t]) => win(f, t)), toiletDoor], H, 0.1);
  for (const [f, t] of southWindows) windowPane(b, 'x', 1.5, f, t, 0.9, 2.4, -1);
  b.hitbox('window', [38, 0.9, 1.3], [40.4, 2.4, 1.5]);

  // 東端：昇降口
  b.wallZ(44, -1.5, 1.5, 'wall', [{ from: -1.1, to: 1.1, top: 2.4 }]);
  collision.add(43.75, -1.1, 44.1, 1.1);
  const exit = new THREE.Group();
  for (const side of [-1, 1]) {
    const panel = b.dynamicBox([0.06, 2.4, 1.08], [0, 1.2, (side * 1.1) / 2], 'doorMetal');
    panel.position.x = 43.86;
    exit.add(panel);
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.9), b.mat('glassDark'));
    glass.rotation.y = -Math.PI / 2;
    glass.position.set(43.82, 1.6, (side * 1.1) / 2);
    exit.add(glass);
    const handle = b.dynamicBox([0.06, 0.25, 0.04], [0, 0, 0], 'metal');
    handle.position.set(43.8, 1.05, side * 0.12);
    exit.add(handle);
  }
  const chain = b.dynamicBox([0.04, 0.5, 0.06], [0, 0, 0], 'metal');
  chain.position.set(43.78, 1.05, 0);
  exit.add(chain);
  b.interactable('exit', exit);
  sign(b, '昇降口', 43.88, 2.68, 0, -Math.PI / 2, 1.0);

  // 西端：机で塞がれた階段
  b.wallZ(-3.4, -1.5, 1.5, 'wall');
  for (let i = 0; i < 10; i++) {
    const x1 = -0.32 * (i + 1);
    const top = -0.19 * (i + 1);
    b.box([x1 - 0.02, -3, -1.4], [x1 + 0.32, top, 1.4], 'floor');
  }
  b.box([-3.4, -3.2, -1.4], [0, -1.9, 1.4], 'dark');
  b.box([-3.4, -3.2, -1.6], [0, 0, -1.4], 'wall');
  b.box([-3.4, -3.2, 1.4], [0, 0, 1.6], 'wall');
  b.box([-3.2, 0.8, -1.42], [0, 0.85, -1.38], 'metal');
  collision.add(-3.4, -1.5, 1.8, 1.5);
  barricade(b);
  b.hitbox('barricade', [0, 0, -1.4], [1.9, 2.2, 1.4]);
  sign(b, '階段', 0.4, 2.65, -1.38, 0, 0.6);

  // 掲示板と消火栓
  const board = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 1.25), new THREE.MeshLambertMaterial({ map: bulletinTexture() }));
  board.position.set(36.6, 1.55, -1.385);
  b.interactable('board', board);
  b.box([35.55, 0.88, -1.4], [37.65, 0.92, -1.36], 'wood');
  b.box([9.4, 0.3, -1.4], [10.2, 1.3, -1.25], 'red');
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff2a1a }));
  lamp.position.set(9.8, 1.45, -1.33);
  b.add(lamp);

  // 廊下の蛍光灯
  lights.addFluorescent(5, H - 0.08, 0, 'dead');
  lights.addFluorescent(12, H - 0.08, 0, 'flicker');
  lights.addFluorescent(20, H - 0.08, 0, 'steady', 0, 3);
  lights.addFluorescent(29, H - 0.08, 0, 'dead');
  lights.addFluorescent(38, H - 0.08, 0, 'dim');

  // ---------------- 教室 ----------------
  classroom(b, '2-B', 15, 24, 'blackboard2b', 'podium2b', [
    'ノックは　三回',
    'そのあと',
    '「はなこさん、いらっしゃいますか」',
  ]);
  classroom(b, '2-A', 25, 34, 'blackboard2a', 'podium2a', ['２月１４日（金）', '日直　　　　　　', '　自習']);
  lights.addFluorescent(29.5, H - 0.08, -5.5, 'dim', Math.PI / 2, 3);
  lights.addFluorescent(19.5, H - 0.08, -5.5, 'dead', Math.PI / 2);

  // 2-A 教卓の上のメモ
  const memo = new THREE.Mesh(
    new THREE.PlaneGeometry(0.32, 0.24),
    new THREE.MeshLambertMaterial({ map: paperTexture('2a', ['はなこさんは', '入口から', '三番目の個室に', 'いる']) }),
  );
  memo.rotation.x = -Math.PI / 2;
  memo.rotation.z = Math.PI / 2 + 0.2;
  memo.position.set(26.35, 1.012, -5.4);
  b.interactable('memo2a', memo);

  // ---------------- 女子トイレ ----------------
  buildToilet(b, lights);
}

/** 窓：外の夜景＋桟。facing は室内側の向き（+1 なら +軸側が室内） */
function windowPane(b: WorldBuilder, axis: 'x' | 'z', fixed: number, from: number, to: number, bottom: number, top: number, facing: 1 | -1): void {
  const w = to - from;
  const h = top - bottom;
  const pane = new THREE.Mesh(new THREE.PlaneGeometry(w, h), b.mat('night'));
  const mid = (from + to) / 2;
  if (axis === 'x') {
    pane.position.set(mid, bottom + h / 2, fixed);
    if (facing < 0) pane.rotation.y = Math.PI;
    // 桟と窓台は室内側に付ける
    b.box([mid - 0.03, bottom, fixed], [mid + 0.03, top, fixed + facing * 0.08], 'frame');
    b.box([from, bottom - 0.03, fixed], [to, bottom + 0.01, fixed + facing * 0.16], 'frame');
  } else {
    pane.position.set(fixed, bottom + h / 2, mid);
    pane.rotation.y = facing > 0 ? Math.PI / 2 : -Math.PI / 2;
    b.box([fixed, bottom, mid - 0.03], [fixed + 0.08, top, mid + 0.03], 'frame');
  }
  b.add(pane);
}

/** 床に落ちる月明かり（加算合成の板） */
function moonPatch(b: WorldBuilder, x1: number, x2: number, z1: number, z2: number): void {
  const geo = new THREE.PlaneGeometry(x2 - x1, z2 - z1);
  geo.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(geo, b.mat('moon'));
  m.position.set((x1 + x2) / 2, 0.006, (z1 + z2) / 2);
  m.renderOrder = 1;
  b.add(m);
}

function sign(b: WorldBuilder, text: string, x: number, y: number, z: number, rotY: number, width: number): void {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(width, width * 0.375), new THREE.MeshLambertMaterial({ map: signTexture(text) }));
  m.position.set(x, y, z);
  m.rotation.y = rotY;
  b.add(m);
}

/** 教室。x1 側の壁が黒板のある前側 */
function classroom(b: WorldBuilder, label: string, x1: number, x2: number, boardId: string, podiumId: string, boardLines: string[]): void {
  const z1 = -9.5;
  const z2 = -1.5;
  b.plane(x1, z1, x2, z2, 0, 'woodfloor');
  b.plane(x1, z1, x2, z2, H, 'ceiling', false);
  b.wallZ(x1, z1, z2, 'wall');
  b.wallZ(x2, z1, z2, 'wall');

  // 外側の窓と月明かり
  const wins: [number, number][] = [
    [x1 + 1, x1 + 3],
    [x1 + 3.5, x1 + 5.5],
    [x1 + 6, x1 + 8],
  ];
  b.wallX(z1, x1, x2, 'wall', wins.map(([f, t]) => ({ from: f, to: t, bottom: 0.9, top: 2.5 })));
  for (const [f, t] of wins) {
    windowPane(b, 'x', z1 - 0.06, f, t, 0.9, 2.5, 1);
    moonPatch(b, f + 0.3, t + 0.3, z1 + 0.15, z1 + 2.4);
  }

  // 黒板
  const bb = new THREE.Mesh(
    new THREE.PlaneGeometry(4, 1.5),
    new THREE.MeshLambertMaterial({ map: blackboardTexture(label, boardLines) }),
  );
  bb.rotation.y = Math.PI / 2;
  bb.position.set(x1 + 0.115, 1.55, -5.5);
  b.interactable(boardId, bb);
  b.box([x1 + 0.1, 0.76, -7.6], [x1 + 0.22, 0.8, -3.4], 'wood');

  // 教卓
  b.box([x1 + 0.9, 0, -6.2], [x1 + 1.7, 1.0, -4.8], 'wood', { collide: true });
  b.hitbox(podiumId, [x1 + 0.9, 0, -6.2], [x1 + 1.7, 1.02, -4.8]);

  // 机と椅子（黒板の方を向く）
  const cols = [x1 + 2.6, x1 + 4.8, x1 + 7.0];
  const rows = [-2.7, -4.1, -5.5, -6.9, -8.3];
  let n = 0;
  for (const cx of cols) {
    for (const cz of rows) {
      n++;
      const jx = Math.sin(n * 12.9898 + x1) * 0.12;
      const jz = Math.cos(n * 78.233 + x1) * 0.08;
      desk(b, cx + jx, cz + jz, n % 7 === 3);
    }
  }

  // 教室札（廊下側に突き出す）
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.24, 0.62), [
    new THREE.MeshLambertMaterial({ map: signTexture(label) }),
    new THREE.MeshLambertMaterial({ map: signTexture(label) }),
    b.mat('metal'),
    b.mat('metal'),
    b.mat('metal'),
    b.mat('metal'),
  ]);
  plate.position.set(x1 + 1.2, 2.55, -1.09);
  b.add(plate);
}

/** 机と椅子 1 組。fallen=true で椅子が倒れている */
function desk(b: WorldBuilder, x: number, z: number, fallen: boolean): void {
  // 天板（x 方向に奥行き 0.45、z 方向に幅 0.6）
  b.box([x - 0.23, 0.68, z - 0.3], [x + 0.22, 0.71, z + 0.3], 'wood');
  b.box([x - 0.2, 0.52, z - 0.27], [x + 0.18, 0.62, z + 0.27], 'metalGray');
  for (const [lx, lz] of [
    [-0.2, -0.27],
    [-0.2, 0.27],
    [0.19, -0.27],
    [0.19, 0.27],
  ]) {
    b.box([x + lx - 0.015, 0, z + lz - 0.015], [x + lx + 0.015, 0.68, z + lz + 0.015], 'metal');
  }
  // 椅子
  const cx = x + 0.48;
  if (fallen) {
    b.box([cx - 0.2, 0, z - 0.2], [cx + 0.2, 0.03, z + 0.2], 'wood');
    b.box([cx + 0.2, 0, z - 0.2], [cx + 0.6, 0.03, z + 0.2], 'wood');
    b.collision.add(x - 0.25, z - 0.3, cx + 0.62, z + 0.3);
  } else {
    b.box([cx - 0.19, 0.42, z - 0.2], [cx + 0.19, 0.45, z + 0.2], 'wood');
    b.box([cx + 0.17, 0.45, z - 0.2], [cx + 0.2, 0.85, z + 0.2], 'wood');
    for (const [lx, lz] of [
      [-0.17, -0.18],
      [-0.17, 0.18],
      [0.17, -0.18],
      [0.17, 0.18],
    ]) {
      b.box([cx + lx - 0.012, 0, z + lz - 0.012], [cx + lx + 0.012, 0.42, z + lz + 0.012], 'metal');
    }
    b.collision.add(x - 0.25, z - 0.3, cx + 0.22, z + 0.3);
  }
}

/** 階段をふさぐ机の山 */
function barricade(b: WorldBuilder): void {
  const spots: [number, number, number, boolean][] = [
    [0.4, -1.0, 0, false],
    [0.5, -0.3, 0, true],
    [0.35, 0.4, 0, false],
    [0.55, 1.05, 0, true],
    [1.2, -0.7, 0, false],
    [1.3, 0.6, 0, false],
    [0.45, -0.7, 0.72, true],
    [0.5, 0.2, 0.72, false],
    [0.4, 0.9, 0.72, false],
    [1.25, -0.1, 0.72, true],
    [0.55, -0.2, 1.44, false],
    [0.6, 0.65, 1.44, true],
  ];
  for (const [x, z, y, flip] of spots) {
    const top = flip ? y : y + 0.68;
    b.box([x - 0.23, top, z - 0.3], [x + 0.22, top + 0.03, z + 0.3], 'wood');
    b.box([x - 0.2, flip ? y + 0.06 : y + 0.52, z - 0.27], [x + 0.18, flip ? y + 0.16 : y + 0.62, z + 0.27], 'metalGray');
    for (const lx of [-0.2, 0.19]) {
      for (const lz of [-0.27, 0.27]) {
        b.box([x + lx - 0.015, flip ? y + 0.03 : y, z + lz - 0.015], [x + lx + 0.015, flip ? y + 0.71 : y + 0.68, z + lz + 0.015], 'metal');
      }
    }
  }
  // 倒れた椅子
  b.box([1.5, 0, -0.2], [1.9, 0.03, 0.2], 'wood');
  b.box([1.55, 0.03, 0.25], [1.85, 0.4, 0.28], 'wood');
}

/**
 * 女子トイレ：x 8〜16, z 1.5〜8.5。
 * 入口は北東（x 13.8〜15.0）。個室は南の壁沿いに、入口に近い方から 1・2・3・4 番。
 */
function buildToilet(b: WorldBuilder, lights: BuildContext['lights']): void {
  const x1 = 8;
  const x2 = 16;
  const z1 = 1.5;
  const z2 = 8.5;
  b.plane(x1, z1, x2, z2, 0.002, 'tilefloor');
  b.plane(x1, z1, x2, z2, H, 'ceiling', false);
  b.wallX(1.55, x1, x2, 'tile', [{ from: 13.8, to: 15.0, top: 2.1 }], H, 0.1);
  b.wallZ(x1, z1, z2, 'tile');
  b.wallZ(x2, z1, z2, 'tile');
  const highWin: Opening = { from: 14.2, to: 15.6, bottom: 1.7, top: 2.5 };
  b.wallX(z2, x1, x2, 'tile', [highWin]);
  windowPane(b, 'x', z2 + 0.06, highWin.from, highWin.to, highWin.bottom!, highWin.top, -1);
  moonPatch(b, 14.0, 15.6, 6.6, 8.3);
  sign(b, '女子', 14.4, 2.45, 1.39, Math.PI, 0.6);

  // 個室：番号 1 が入口に一番近い（東側）
  const fz = 6.8; // 正面パネルの z
  const back = z2 - 0.1;
  const edges = [13.6, 12.2, 10.8, 9.4, 8.1];
  for (const x of edges.slice(0, 4)) {
    b.box([x - 0.025, 0.1, fz], [x + 0.025, 2.0, back], 'stall', { collide: true });
  }
  b.box([edges[0] - 0.06, 2.0, fz - 0.04], [edges[4], 2.06, fz + 0.04], 'stall');
  for (let i = 0; i < 4; i++) {
    const right = edges[i];
    const left = edges[i + 1];
    const c = (left + right) / 2;
    const dw = 0.72;
    const hinge = c - dw / 2;
    // 扉の左右のパネル
    b.box([left, 0.1, fz - 0.02], [hinge, 2.0, fz + 0.02], 'stall', { collide: true });
    b.box([c + dw / 2, 0.1, fz - 0.02], [right - 0.025, 2.0, fz + 0.02], 'stall', { collide: true });

    // 扉：蝶番を軸に回る
    const id = `stall${i + 1}`;
    const pivot = new THREE.Group();
    pivot.position.set(hinge, 0, fz);
    const leaf = b.dynamicBox([dw - 0.02, 1.84, 0.035], [dw / 2, 0.12 + 0.92, 0], 'stallDoor');
    pivot.add(leaf);
    const knob = b.dynamicBox([0.04, 0.12, 0.05], [dw - 0.09, 1.0, -0.035], 'metal');
    pivot.add(knob);
    // 空き／使用中の表示（青）
    const ind = new THREE.Mesh(new THREE.PlaneGeometry(0.07, 0.04), new THREE.MeshBasicMaterial({ color: 0x2a4a9a }));
    ind.position.set(dw - 0.09, 1.12, -0.019);
    ind.rotation.y = Math.PI;
    pivot.add(ind);
    b.interactable(id, pivot);
    b.collision.add(hinge, fz - 0.03, hinge + dw, fz + 0.03, `${id}door`);
    // 内側に開く
    b.openable(id, pivot, -1.75, `${id}door`);

    // 和式の便器
    b.box([c - 0.2, 0, 7.25], [c + 0.2, 0.06, 8.0], 'porcelain');
    b.box([c - 0.14, 0.061, 7.4], [c + 0.14, 0.062, 7.9], 'dark');
    b.box([c - 0.2, 0, 7.15], [c + 0.2, 0.22, 7.27], 'porcelain');
    b.box([c + 0.25, 1.1, back - 0.1], [c + 0.45, 1.3, back], 'porcelain');
  }

  // 3 番目の個室の奥に出る鍵（最初は見えない）
  const key = new THREE.Group();
  const keyMat = new THREE.MeshLambertMaterial({ color: 0xc9a54a, emissive: 0x3a2a08 });
  const bow = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.01, 6, 12), keyMat);
  bow.rotation.x = -Math.PI / 2;
  key.add(bow);
  const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.012, 0.018), keyMat);
  shaft.position.x = 0.09;
  key.add(shaft);
  const tag = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.006, 0.09), new THREE.MeshLambertMaterial({ color: 0xd8d0b0 }));
  tag.position.set(-0.07, 0, 0.02);
  key.add(tag);
  key.position.set(10.1, 0.07, 7.0);
  key.rotation.y = 0.6;
  b.interactable('key', key);

  // 洗面台と鏡（東の壁）
  b.box([15.35, 0.78, 3.0], [15.9, 0.86, 5.9], 'porcelain', { collide: true });
  b.box([15.5, 0, 3.05], [15.9, 0.78, 5.85], 'dark');
  for (const z of [3.5, 4.45, 5.4]) {
    b.box([15.45, 0.84, z - 0.25], [15.8, 0.87, z + 0.25], 'dark');
    b.box([15.75, 0.86, z - 0.02], [15.85, 1.05, z + 0.02], 'metal');
    b.box([15.65, 1.0, z - 0.02], [15.85, 1.04, z + 0.02], 'metal');
  }
  b.hitbox('sink', [15.3, 0.7, 3.0], [15.9, 1.05, 5.9]);
  const mirror = new THREE.Mesh(new THREE.PlaneGeometry(2.7, 0.85), b.mat('mirror'));
  mirror.rotation.y = -Math.PI / 2;
  mirror.position.set(15.885, 1.5, 4.45);
  b.interactable('mirror', mirror);
  b.box([15.86, 1.05, 3.05], [15.9, 1.95, 5.85], 'frame');

  // 用具入れ（西の壁）
  b.box([8.1, 0, 2.0], [8.65, 1.9, 2.95], 'locker', { collide: true });
  b.box([8.649, 1.55, 2.3], [8.652, 1.62, 2.65], 'dark');
  b.hitbox('locker', [8.1, 0, 2.0], [8.7, 1.9, 2.95]);

  lights.addFluorescent(12, H - 0.08, 4.2, 'flicker', 0, 3.2);
}
