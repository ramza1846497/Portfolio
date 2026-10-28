import * as THREE from 'three';
import type { BuildContext } from '../../game/types';
import type { Opening, WorldBuilder } from '../../world/builder';
import { bulletinTexture, paperTexture, portraitTexture, scrawlTexture } from '../../engine/textures';
import {
  H,
  barricade,
  blackboard,
  chair,
  desk,
  doorOpening,
  ghostFigure,
  keyMesh,
  moonPatch,
  notice,
  piano,
  roomPlate,
  roomShell,
  sign,
  slidingDoor,
  stairwell,
  wallPlane,
  windowOpening,
  windowPane,
  shadowChild,
  shinaiProp,
} from './parts';

/**
 * 校舎 2 階（z = 0 付近）。
 *
 *   北 (-z)
 *   ┌─────────────┬─────────┬─────────┬──────────┐
 *   │   音楽室     │  2-B    │  2-A    │  掲示板  │
 *   │西階段 ├──扉──┴─扉───扉─┴─扉───扉─┴──────────┤東階段
 *   │(十三階段)   廊下 (x: 0〜44)          スタート ■■│(机で封鎖)
 *   │     ├──女子トイレ──┤                         │
 *   └─────┴──────────────┴─────────────────────────┘
 *   南 (+z)
 */
export function buildFloor2({ builder: b, lights }: BuildContext): void {
  // ---------------- 廊下 ----------------
  b.plane(0, -1.5, 44, 1.5, 0, 'floor');
  b.plane(-3.4, -1.5, 44, 1.5, H, 'ceiling', false);

  b.wallX(-1.5, -3.4, 44, 'wall', [doorOpening(11.6), doorOpening(15.6), doorOpening(22.4), doorOpening(25.6), doorOpening(32.4)]);

  // 南側の壁（窓とトイレの入口）。トイレ側はタイルを貼るので 2 枚重ね
  const southWindows: [number, number][] = [
    [2.6, 4.6],
    [5.2, 7.4],
    [17, 19.4],
    [20.4, 22.8],
    [24, 26.4],
    [27.4, 29.8],
    [31, 33.4],
    [34.4, 36.8],
    [38, 40.4],
  ];
  const toiletDoor: Opening = { from: 13.8, to: 15.0, top: 2.1 };
  b.wallX(1.45, -3.4, 44, 'wall', [...southWindows.map(([f, t]) => windowOpening(f, t)), toiletDoor], H, 0.1);
  for (const [f, t] of southWindows) windowPane(b, 'x', 1.5, f, t, 0.9, 2.4, -1);
  b.hitbox('window', [38, 0.9, 1.3], [40.4, 2.4, 1.5]);

  // 東端：机で塞がれた東階段
  b.wallZ(44, -1.5, 1.5, 'wall');
  barricade(b, 43.9, -1);
  b.collision.add(42.1, -1.5, 44, 1.5);
  b.hitbox('barricadeEast', [42.1, 0, -1.4], [43.9, 2.2, 1.4]);
  sign(b, '東階段', 43.88, 2.6, 0, -Math.PI / 2, 0.8);
  notice(b, 'eastClosed', '使用禁止', ['東階段は', '老朽化のため', '使用できません'], [42.05, 1.15, 0.2], -Math.PI / 2);

  // 西端：下り階段（十三階段）と、壁の落書き
  stairwell(b, 0, true);
  b.hitbox('stairs2f', [-3.2, -2, -1.35], [0.1, 1.8, 1.35]);
  sign(b, '西階段', 0.4, 2.65, -1.38, 0, 0.6);
  const scrawl = wallPlane(b, scrawlTexture('13', ['十三段目は', 'ふむな']), 1.6, 0.8, [1.3, 1.5, 1.385], Math.PI, true);
  b.interactable('graffiti', scrawl);

  // 掲示板と消火栓
  const board = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 1.25), new THREE.MeshLambertMaterial({ map: bulletinTexture() }));
  board.position.set(36.6, 1.55, -1.385);
  b.interactable('board', board);
  b.box([35.55, 0.88, -1.4], [37.65, 0.92, -1.36], 'wood');
  b.box([9.4, 0.3, -1.4], [10.2, 1.3, -1.25], 'red');
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff2a1a }));
  lamp.position.set(9.8, 1.45, -1.33);
  b.add(lamp);

  lights.addFluorescent(5, H - 0.08, 0, 'dim');
  lights.addFluorescent(12, H - 0.08, 0, 'flicker');
  lights.addFluorescent(20, H - 0.08, 0, 'steady', 0, 3);
  lights.addFluorescent(29, H - 0.08, 0, 'dead');
  lights.addFluorescent(38, H - 0.08, 0, 'dim');

  // ---------------- 教室 ----------------
  classroom(b, '2-B', 15, 24, 'blackboard2b', 'podium2b', ['ノックは　三回', 'そのあと', '「はなこさん、いらっしゃいますか」']);
  classroom(b, '2-A', 25, 34, 'blackboard2a', 'podium2a', ['２月１４日（金）', '日直　　　　　　', '　自習']);
  lights.addFluorescent(29.5, H - 0.08, -5.5, 'dim', Math.PI / 2, 3);
  lights.addFluorescent(19.5, H - 0.08, -5.5, 'dead', Math.PI / 2);

  const memo = new THREE.Mesh(
    new THREE.PlaneGeometry(0.32, 0.24),
    new THREE.MeshLambertMaterial({ map: paperTexture('2a', ['はなこさんは', '入口から', '三番目の個室に', 'いる']) }),
  );
  memo.rotation.x = -Math.PI / 2;
  memo.rotation.z = Math.PI / 2 + 0.2;
  memo.position.set(26.35, 1.012, -5.4);
  b.interactable('memo2a', memo);

  buildMusicRoom(b, lights);
  buildToilet(b, lights);

  // 女子トイレの前に一瞬だけ立つ少女
  const glimpse = ghostFigure({ hair: 0x050505, top: 0xe8e8e0, bottom: 0x8a1010, opacity: 0.85 });
  glimpse.position.set(14.4, 0, 0.85);
  glimpse.rotation.y = Math.PI;
  b.add(glimpse, 'hanakoGlimpse');

  // 2-B の後ろの扉の脇に、剣道部の竹刀と防具袋
  const shinai = shinaiProp(b);
  shinai.position.set(24.4, 0, -1.3);
  b.interactable('shinai', shinai);
  b.box([24.6, 0, -1.4], [25.3, 0.45, -1.1], 'blanket');

  // 西階段の前にうずくまる影（最初の敵）。倒すまで階段へは行けない
  const shadow = shadowChild();
  shadow.position.set(1.9, 0, 0.1);
  shadow.rotation.y = -Math.PI / 2;
  b.add(shadow, 'shadow1');
  b.interactable('shadow1Look', b.hitShape([0.8, 1.3, 0.8], [1.9, 0.6, 0.1]));
  b.collision.add(2.4, -1.5, 2.6, 1.5, 'shadowBlock');

  b.spawn('start', 40, 0, Math.PI / 2);
  b.spawn('f2Stairs', 1.0, 0, -Math.PI / 2);
}

/** 2-A・2-B */
function classroom(b: WorldBuilder, label: string, x1: number, x2: number, boardId: string, podiumId: string, boardLines: string[]): void {
  roomShell(b, x1, x2, -9.5, -1.5);
  blackboard(b, boardId, label, boardLines, x1, -5.5, 1);
  b.box([x1 + 0.9, 0, -6.2], [x1 + 1.7, 1.0, -4.8], 'wood', { collide: true });
  b.hitbox(podiumId, [x1 + 0.9, 0, -6.2], [x1 + 1.7, 1.0, -4.8]);
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
  roomPlate(b, label, x1 + 1.2, -1.5, 1);
}

/**
 * 音楽室：x 1〜14。扉は施錠（人体模型が持っている鍵で開く）。
 * 西の壁にピアノ、東の壁に黒板、廊下側の壁に肖像画。
 */
function buildMusicRoom(b: WorldBuilder, lights: BuildContext['lights']): void {
  roomShell(b, 1, 14, -9.5, -1.5);
  slidingDoor(b, 'musicDoor', 11.6, -1.5, 1.2, true);
  roomPlate(b, '音楽室', 12.2, -1.5, 1);

  // ピアノ（正面 +x）と椅子
  const p = piano(b);
  p.position.set(1.85, 0, -6.5);
  b.interactable('piano', p);
  b.collision.add(1.1, -7.3, 2.05, -5.7);
  b.box([2.3, 0, -6.95], [2.65, 0.45, -6.05], 'dark', { collide: true });

  // 弾いている子ども（半透明）
  const pianist = ghostFigure({ hair: 0x111111, top: 0x1a1a24, bottom: 0x1a1a24, opacity: 0.45, height: 1.3 });
  pianist.position.set(2.45, 0, -6.5);
  pianist.rotation.y = -Math.PI / 2;
  b.add(pianist, 'pianist');

  // ピアノの上に出る鍵
  const key = keyMesh(b);
  key.position.set(1.6, 1.32, -6.2);
  b.interactable('toiletKeyObj', key);

  // 黒板：今月の歌
  blackboard(b, 'blackboardMusic', 'music', ['今月の歌「かえるのうた」', 'ド レ ミ ファ ミ レ ド', 'ミ ファ ソ ラ ソ ファ ミ'], 14, -5.5, -1);

  // 肖像画（廊下側の壁の内側）
  const names = ['バッハ', 'モーツァルト', 'ベートーヴェン', 'ショパン'];
  names.forEach((n, i) => wallPlane(b, portraitTexture(n, i), 0.6, 0.82, [3 + i * 2, 2.1, -1.615], Math.PI));
  b.hitbox('portraits', [2.6, 1.6, -1.7], [9.4, 2.6, -1.6]);

  // 生徒の椅子（ピアノの方を向く）
  for (const x of [5.5, 7.5, 9.5, 11.5]) {
    for (const z of [-3.6, -5.4, -7.2, -8.6]) {
      chair(b, x, z);
      b.collision.add(x - 0.2, z - 0.2, x + 0.22, z + 0.2);
    }
  }
  lights.addFluorescent(7.5, H - 0.08, -5.5, 'flicker', Math.PI / 2, 2.4);
}

/**
 * 女子トイレ：x 8〜16, z 1.5〜8.5。入口は北東（x 13.8〜15.0）で、最初は施錠。
 * 個室は南の壁沿いに、入口に近い方から 1・2・3・4 番。
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

  // 入口の扉（内側へ開く）と、清掃中の鎖
  const door = new THREE.Group();
  door.position.set(13.8, 0, 1.5);
  door.add(b.dynamicBox([1.18, 2.06, 0.05], [0.6, 1.03, 0], 'stallDoor'));
  b.interactable('toiletDoor', door);
  b.collision.add(13.8, 1.38, 15.0, 1.62, 'toiletDoordoor');
  b.openable('toiletDoor', door, -1.5, 'toiletDoordoor');
  const chain = new THREE.Group();
  chain.add(b.dynamicBox([1.0, 0.04, 0.04], [14.4, 1.05, 1.36], 'metal'));
  chain.add(b.dynamicBox([0.09, 0.12, 0.05], [14.4, 0.96, 1.35], 'metal'));
  const cleaning = notice(b, 'cleaning', '清掃中', ['立入禁止', '', '　　用務員'], [14.4, 1.5, 1.36], Math.PI, '#1a3a7a');
  cleaning.removeFromParent();
  chain.add(cleaning);
  b.add(chain, 'toiletChain');

  const fz = 6.8;
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
    b.box([left, 0.1, fz - 0.02], [hinge, 2.0, fz + 0.02], 'stall', { collide: true });
    b.box([c + dw / 2, 0.1, fz - 0.02], [right - 0.025, 2.0, fz + 0.02], 'stall', { collide: true });

    const id = `stall${i + 1}`;
    const pivot = new THREE.Group();
    pivot.position.set(hinge, 0, fz);
    pivot.add(b.dynamicBox([dw - 0.02, 1.84, 0.035], [dw / 2, 0.12 + 0.92, 0], 'stallDoor'));
    pivot.add(b.dynamicBox([0.04, 0.12, 0.05], [dw - 0.09, 1.0, -0.035], 'metal'));
    const ind = new THREE.Mesh(new THREE.PlaneGeometry(0.07, 0.04), new THREE.MeshBasicMaterial({ color: 0x2a4a9a }));
    ind.position.set(dw - 0.09, 1.12, -0.019);
    ind.rotation.y = Math.PI;
    pivot.add(ind);
    b.interactable(id, pivot);
    b.collision.add(hinge, fz - 0.03, hinge + dw, fz + 0.03, `${id}door`);
    b.openable(id, pivot, -1.75, `${id}door`);

    b.box([c - 0.2, 0, 7.25], [c + 0.2, 0.06, 8.0], 'porcelain');
    b.box([c - 0.14, 0.061, 7.4], [c + 0.14, 0.062, 7.9], 'dark');
    b.box([c - 0.2, 0, 7.15], [c + 0.2, 0.22, 7.27], 'porcelain');
    b.box([c + 0.25, 1.1, back - 0.1], [c + 0.45, 1.3, back], 'porcelain');
  }

  const key = keyMesh(b);
  key.position.set(10.1, 0.07, 7.0);
  key.rotation.y = 0.6;
  b.interactable('key', key);

  // 3 番目の個室に一瞬だけ見える花子さん
  const hanako = ghostFigure({ hair: 0x050505, top: 0xe8e8e0, bottom: 0x8a1010, opacity: 0.9 });
  hanako.position.set(10.1, 0, 7.6);
  hanako.rotation.y = Math.PI;
  b.add(hanako, 'hanakoFigure');

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
  mirror.position.set(15.855, 1.5, 4.45);
  b.interactable('mirror', mirror);
  b.box([15.86, 1.05, 3.05], [15.9, 1.95, 5.85], 'frame');

  b.box([8.1, 0, 2.0], [8.65, 1.9, 2.95], 'locker', { collide: true });
  b.box([8.649, 1.55, 2.3], [8.652, 1.62, 2.65], 'dark');
  b.hitbox('locker', [8.1, 0, 2.0], [8.7, 1.9, 2.95]);

  lights.addFluorescent(12, H - 0.08, 4.2, 'flicker', 0, 3.2, 'toilet');
}
