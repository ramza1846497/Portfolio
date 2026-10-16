// 店内レイアウト（純粋なデータ）。見た目は storeView.js がこのデータから作る。
// 座標：x は西(-)〜東(+)、z は奥(-)〜入口(+)、単位はメートル。店は x:-6〜6, z:-5〜5。

import { box } from './collision.js';

export const PLAYER_RADIUS = 0.3;
export const CUSTOMER_RADIUS = 0.28;
export const EYE_HEIGHT = 1.6;
export const PLAYER_SPAWN = { x: 2.0, z: 1.2, yaw: 0 };

export const DOOR = { x: 4.5, z: 5.0, width: 1.8 };
export const BACKYARD_OPENING = { minX: 3.4, maxX: 5.0 };

// 当たり判定のある固定物。h は見た目の高さ
export const SOLIDS = [
  // 外壁（南側は自動ドアのところが空いている）
  { id: 'wallN', kind: 'wall', h: 3, ...box(-6.1, 6.1, -5.1, -5.0) },
  { id: 'wallW', kind: 'wall', h: 3, ...box(-6.1, -6.0, -5.1, 5.1) },
  { id: 'wallE', kind: 'wall', h: 3, ...box(6.0, 6.1, -5.1, 5.1) },
  { id: 'wallS1', kind: 'wall', h: 3, ...box(-6.1, DOOR.x - DOOR.width / 2, 5.0, 5.1) },
  { id: 'wallS2', kind: 'wall', h: 3, ...box(DOOR.x + DOOR.width / 2, 6.1, 5.0, 5.1) },
  // バックヤードとの仕切り
  { id: 'partW', kind: 'wall', h: 3, ...box(-6.0, BACKYARD_OPENING.minX, -3.1, -2.9) },
  { id: 'partE', kind: 'wall', h: 3, ...box(BACKYARD_OPENING.maxX, 6.0, -3.1, -2.9) },
  // 売り場
  { id: 'fridge', kind: 'fridge', h: 2.0, ...box(-5.6, 2.4, -2.9, -2.3) },
  { id: 'shelfA', kind: 'shelf', h: 1.4, ...box(-4.6, -1.6, -0.6, 0.2) },
  { id: 'shelfB', kind: 'shelf', h: 1.4, ...box(-0.4, 2.6, -0.6, 0.2) },
  { id: 'counter', kind: 'counter', h: 0.95, ...box(-6.0, 0.8, 2.4, 3.0) },
  { id: 'fryer', kind: 'fryer', h: 0.9, ...box(-1.6, -0.6, 4.3, 4.95) },
  // バックヤード
  { id: 'rack', kind: 'rack', h: 0.25, ...box(-5.95, 2.3, -4.98, -4.0) },
  { id: 'desk', kind: 'desk', h: 0.75, ...box(2.6, 3.3, -4.98, -4.35) },
];

// プレイヤーだけが通れない見えない壁（店の外へ出ない）
export const PLAYER_ONLY = [box(DOOR.x - DOOR.width / 2, DOOR.x + DOOR.width / 2, 5.0, 5.1)];

export const PLAYER_OBSTACLES = [...SOLIDS, ...PLAYER_ONLY];
export const CUSTOMER_OBSTACLES = SOLIDS;

// レジカウンターの内側（店員側）
export const STAFF_AREA = box(-6.0, 0.8, 3.0, 5.0);
export const REGISTER_POS = { x: -4.4, y: 0.95, z: 2.7 };
export const HOTCASE_POS = { x: -0.3, y: 0.95, z: 2.7 };
export const FRYER_POS = { x: -1.1, y: 0.9, z: 4.62 };
export const TERMINAL_POS = { x: 2.95, y: 0.75, z: -4.65 };
export const MOP_STAND = { x: 5.5, z: -4.6 };

export function inStaffArea(x, z) {
  return x >= STAFF_AREA.minX && x <= STAFF_AREA.maxX && z >= STAFF_AREA.minZ && z <= STAFF_AREA.maxZ;
}

// 棚の売り場（商品ごとに1区画、2段 × 6個）
export const ITEMS_PER_LEVEL = 6;
export const LEVELS = 2;
export const SHELF_CAPACITY = ITEMS_PER_LEVEL * LEVELS;

// face: 棚のどちら側を向いているか（+1 = z+方向、-1 = z-方向）
const SECTIONS = [
  // 冷蔵棚（手前 z=-2.3 に向いている）
  { productId: 'tea', faceZ: -2.3, dir: 1, x: -4.6, width: 1.9, levels: [0.9, 1.4] },
  { productId: 'water', faceZ: -2.3, dir: 1, x: -2.6, width: 1.9, levels: [0.9, 1.4] },
  { productId: 'juice', faceZ: -2.3, dir: 1, x: -0.6, width: 1.9, levels: [0.9, 1.4] },
  { productId: 'latte', faceZ: -2.3, dir: 1, x: 1.4, width: 1.9, levels: [0.9, 1.4] },
  // 棚A：奥側おにぎり、手前側パン
  { productId: 'onigiri_sake', faceZ: -0.6, dir: -1, x: -3.85, width: 1.4, levels: [0.6, 1.0] },
  { productId: 'onigiri_tuna', faceZ: -0.6, dir: -1, x: -2.35, width: 1.4, levels: [0.6, 1.0] },
  { productId: 'melonpan', faceZ: 0.2, dir: 1, x: -3.85, width: 1.4, levels: [0.6, 1.0] },
  { productId: 'currypan', faceZ: 0.2, dir: 1, x: -2.35, width: 1.4, levels: [0.6, 1.0] },
  // 棚B：奥側お菓子、手前側日用品
  { productId: 'chips', faceZ: -0.6, dir: -1, x: 0.35, width: 1.4, levels: [0.6, 1.0] },
  { productId: 'choco', faceZ: -0.6, dir: -1, x: 1.85, width: 1.4, levels: [0.6, 1.0] },
  { productId: 'battery', faceZ: 0.2, dir: 1, x: 0.35, width: 1.4, levels: [0.6, 1.0] },
  { productId: 'towel', faceZ: 0.2, dir: 1, x: 1.85, width: 1.4, levels: [0.6, 1.0] },
];

export const SHELF_SECTIONS = SECTIONS.map((s) => ({
  ...s,
  pickNode: `pick_${s.productId}`,
  pickSpot: { x: s.x, z: s.faceZ + s.dir * 0.7 },
  // 商品1個ずつの位置
  slots: s.levels.flatMap((y) =>
    Array.from({ length: ITEMS_PER_LEVEL }, (_, i) => ({
      x: s.x - s.width / 2 + (s.width / ITEMS_PER_LEVEL) * (i + 0.5),
      y,
      z: s.faceZ - s.dir * 0.17,
    })),
  ),
}));

export const SECTION_BY_PRODUCT = Object.fromEntries(SHELF_SECTIONS.map((s) => [s.productId, s]));

// バックヤードの段ボール置き場（14列 × 2行 × 2段）
export const RACK_SLOTS = [];
for (let layer = 0; layer < 2; layer++) {
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 14; col++) {
      RACK_SLOTS.push({ x: -5.6 + col * 0.55, y: 0.25 + 0.2 + layer * 0.42, z: -4.72 + row * 0.5 });
    }
  }
}

// レジ待ちの列（先頭がレジの前）
export const QUEUE_SLOTS = Array.from({ length: 6 }, (_, i) => ({ x: REGISTER_POS.x + i * 0.8, z: 1.85 }));

// 客の移動に使う経由点
export const WAYPOINTS = [
  { id: 'out', x: 4.5, z: 7.5 },
  { id: 'doorIn', x: 4.5, z: 4.0 },
  { id: 'frontE', x: 3.8, z: 1.0 },
  { id: 'frontM', x: -1.0, z: 1.0 },
  { id: 'frontW', x: -5.3, z: 1.0 },
  { id: 'backE', x: 3.4, z: -1.45 },
  { id: 'backM', x: -1.0, z: -1.45 },
  { id: 'backW', x: -5.3, z: -1.45 },
  ...SHELF_SECTIONS.map((s) => ({ id: s.pickNode, ...s.pickSpot })),
  ...QUEUE_SLOTS.map((q, i) => ({ id: `queue${i}`, ...q })),
];

// 汚れが出る場所（売り場の通路）
export const DIRT_SPOTS = [
  { x: -3.0, z: -1.5 }, { x: 0.5, z: -1.4 }, { x: 3.6, z: -0.6 }, { x: -5.2, z: -0.3 },
  { x: -1.0, z: -0.2 }, { x: 2.0, z: 1.0 }, { x: -3.2, z: 1.1 }, { x: 4.4, z: 2.6 },
];
