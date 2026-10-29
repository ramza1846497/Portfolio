import * as THREE from 'three';
import type { Opening, WorldBuilder } from '../../world/builder';
import { blackboardTexture, muscleTexture, noticeTexture, signTexture } from '../../engine/textures';
import { blackboardTrim, shinaiMesh } from './props';

/** 天井の高さ */
export const H = 3;

/** 窓：外の夜景＋桟。facing は室内側の向き（+1 なら +軸側が室内） */
export function windowPane(b: WorldBuilder, axis: 'x' | 'z', fixed: number, from: number, to: number, bottom: number, top: number, facing: 1 | -1): void {
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
    b.box([fixed, bottom, mid - 0.03], [fixed + facing * 0.08, top, mid + 0.03], 'frame');
    b.box([fixed, bottom - 0.03, from], [fixed + facing * 0.16, bottom + 0.01, to], 'frame');
  }
  b.add(pane);
}

/** 床に落ちる月明かり（加算合成の板） */
/** 壁に貼る紙・札の材質：壁とちらつかないよう、深度を手前に寄せる */
function decal(params: THREE.MeshLambertMaterialParameters): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({ ...params, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
}

export function moonPatch(b: WorldBuilder, x1: number, x2: number, z1: number, z2: number): void {
  const geo = new THREE.PlaneGeometry(x2 - x1, z2 - z1);
  geo.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(geo, b.mat('moon'));
  m.position.set((x1 + x2) / 2, 0.006, (z1 + z2) / 2);
  m.renderOrder = 1;
  b.add(m);
}

export function sign(b: WorldBuilder, text: string, x: number, y: number, z: number, rotY: number, width: number): void {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(width, width * 0.375), decal({ map: signTexture(text) }));
  m.position.set(x, y, z);
  m.rotation.y = rotY;
  b.add(m);
}

/** 壁に貼る板（貼り紙・落書き・肖像画など）。rotY で向きを決める */
export function wallPlane(b: WorldBuilder, tex: THREE.Texture, w: number, h: number, pos: [number, number, number], rotY: number, transparent = false): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), decal({ map: tex, transparent }));
  m.position.set(pos[0], pos[1], pos[2]);
  m.rotation.y = rotY;
  b.add(m);
  return m;
}

export function notice(b: WorldBuilder, key: string, title: string, lines: string[], pos: [number, number, number], rotY: number, accent?: string): THREE.Mesh {
  return wallPlane(b, noticeTexture(key, title, lines, accent), 0.5, 0.66, pos, rotY);
}

/** 教室札（廊下側に突き出す）。corridorSide は札を付ける壁の z */
export function roomPlate(b: WorldBuilder, label: string, x: number, wallZ: number, dir: 1 | -1): void {
  const mat = new THREE.MeshLambertMaterial({ map: signTexture(label) });
  const metal = b.mat('metal');
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.24, 0.62), [mat, mat, metal, metal, metal, metal]);
  plate.position.set(x, 2.55, wallZ + dir * 0.41);
  b.add(plate);
}

/**
 * 廊下の北側に並ぶ部屋の外枠：床・天井・左右と奥の壁・窓・月明かり。
 * 廊下側の壁（扉の穴）は廊下を作る側で用意する。
 */
export function roomShell(b: WorldBuilder, x1: number, x2: number, zFar: number, zNear: number, floor = 'woodfloor', windows = true): void {
  b.plane(x1, zFar, x2, zNear, 0, floor);
  b.plane(x1, zFar, x2, zNear, H, 'ceiling', false);
  b.wallZ(x1, zFar, zNear, 'wall');
  b.wallZ(x2, zFar, zNear, 'wall');
  if (!windows) {
    b.wallX(zFar, x1, x2, 'wall');
    return;
  }
  const wins: [number, number][] = [];
  for (let x = x1 + 1; x + 2 <= x2 - 0.5; x += 2.5) wins.push([x, x + 2]);
  b.wallX(zFar, x1, x2, 'wall', wins.map(([f, t]) => ({ from: f, to: t, bottom: 0.9, top: 2.5 })));
  for (const [f, t] of wins) {
    windowPane(b, 'x', zFar - 0.06, f, t, 0.9, 2.5, 1);
    moonPatch(b, f + 0.3, t + 0.3, zFar + 0.15, zFar + 2.4);
  }
}

/** 黒板（x の壁に貼る。facing=+1 で +x 向き） */
export function blackboard(b: WorldBuilder, id: string, key: string, lines: string[], x: number, zc: number, facing: 1 | -1): void {
  const bb = new THREE.Mesh(new THREE.PlaneGeometry(4, 1.5), new THREE.MeshLambertMaterial({ map: blackboardTexture(key, lines) }));
  bb.rotation.y = facing > 0 ? Math.PI / 2 : -Math.PI / 2;
  bb.position.set(x + facing * 0.115, 1.55, zc);
  b.interactable(id, bb);
  blackboardTrim(b, x, zc, facing);
}

/** 机と椅子 1 組（黒板は -x 側）。fallen=true で椅子が倒れている */
export function desk(b: WorldBuilder, x: number, z: number, fallen: boolean): void {
  // 写真のモデル（正面 +z）を、黒板（-x）に向ける
  if (b.prop('SchoolDesk_01', [x, 0, z], -Math.PI / 2, 0.85)) {
    const cx = x + 0.5;
    if (fallen) {
      // 椅子が後ろへ倒れている
      b.prop('SchoolChair_01', [cx + 0.35, 0.3, z], [Math.PI / 2, -Math.PI / 2, 0], 0.9);
      b.collision.add(x - 0.25, z - 0.3, cx + 0.8, z + 0.3);
    } else {
      chair(b, cx, z);
      b.collision.add(x - 0.25, z - 0.3, cx + 0.25, z + 0.3);
    }
    return;
  }
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
  const cx = x + 0.48;
  if (fallen) {
    b.box([cx - 0.2, 0, z - 0.2], [cx + 0.2, 0.03, z + 0.2], 'wood');
    b.box([cx + 0.2, 0, z - 0.2], [cx + 0.6, 0.03, z + 0.2], 'wood');
    b.collision.add(x - 0.25, z - 0.3, cx + 0.62, z + 0.3);
  } else {
    chair(b, cx, z);
    b.collision.add(x - 0.25, z - 0.3, cx + 0.22, z + 0.3);
  }
}

/** 椅子（背もたれが +x 側） */
export function chair(b: WorldBuilder, cx: number, z: number): void {
  if (b.prop('SchoolChair_01', [cx, 0, z], -Math.PI / 2, 0.9)) return;
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
}

/** 机の山（バリケード）。x0 から dir の向きに積む */
export function barricade(b: WorldBuilder, x0: number, dir: 1 | -1, oz = 0): void {
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
  for (const [dx, dz, y, flip] of spots) {
    const x = x0 + dir * dx;
    const z = oz + dz;
    // 写真の机を、上下さかさま・ななめに積み上げる
    const ry = -Math.PI / 2 + Math.sin(dx * 9 + dz * 5) * 0.35;
    if (flip ? b.prop('SchoolDesk_01', [x, y + 0.76, z], [Math.PI, ry, Math.sin(dz * 3) * 0.08], 0.85) : b.prop('SchoolDesk_01', [x, y, z], [0, ry, Math.sin(dx * 7) * 0.05], 0.85)) {
      if (!flip && y > 1) b.prop('SchoolChair_01', [x + 0.1, y + 0.76, z], [0.2, ry + 1.2, 0.3], 0.9);
      continue;
    }
    const top = flip ? y : y + 0.68;
    b.box([x - 0.23, top, z - 0.3], [x + 0.22, top + 0.03, z + 0.3], 'wood');
    b.box([x - 0.2, flip ? y + 0.06 : y + 0.52, z - 0.27], [x + 0.18, flip ? y + 0.16 : y + 0.62, z + 0.27], 'metalGray');
    for (const lx of [-0.2, 0.19]) {
      for (const lz of [-0.27, 0.27]) {
        b.box([x + lx - 0.015, flip ? y + 0.03 : y, z + lz - 0.015], [x + lx + 0.015, flip ? y + 0.71 : y + 0.68, z + lz + 0.015], 'metal');
      }
    }
  }
}

/**
 * 階段（x0 から西へ下りる、または上がる）。
 * down=true なら床より下へ、false なら上へ伸びる。プレイヤーは段に入れない。
 */
export function stairwell(b: WorldBuilder, oz: number, down: boolean): void {
  const z1 = oz - 1.4;
  const z2 = oz + 1.4;
  b.wallZ(-3.4, oz - 1.5, oz + 1.5, 'wall', [], down ? H : H + 3);
  for (let i = 0; i < 10; i++) {
    const x1 = -0.32 * (i + 1);
    if (down) b.box([x1 - 0.02, -3, z1], [x1 + 0.32, -0.19 * (i + 1), z2], 'floor');
    else b.box([x1 - 0.02, 0, z1], [x1 + 0.32, 0.19 * (i + 1), z2], 'floor');
  }
  if (down) {
    b.box([-3.4, -3.2, z1], [0, -1.9, z2], 'dark');
    b.box([-3.4, -3.2, oz - 1.6], [0, 0, oz - 1.4], 'wall');
    b.box([-3.4, -3.2, oz + 1.4], [0, 0, oz + 1.6], 'wall');
  } else {
    // 上り階段の上は吹き抜け
    b.box([-3.4, H, oz - 1.6], [0, H + 3, oz - 1.4], 'wall');
    b.box([-3.4, H, oz + 1.4], [0, H + 3, oz + 1.6], 'wall');
    b.box([-3.4, H + 2.9, z1], [0, H + 3, z2], 'dark');
  }
  // 手すり
  b.box([-3.2, down ? 0.8 : 0.9, oz - 1.42], [0, down ? 0.85 : 0.95, oz - 1.38], 'metal');
  b.collision.add(-3.4, oz - 1.5, 0.15, oz + 1.5);
}

/** 引き戸（教室・音楽室の扉）。開くと slide 方向へ動く */
export function slidingDoor(b: WorldBuilder, id: string, x: number, wallZ: number, width: number, interact: boolean): THREE.Group {
  const g = new THREE.Group();
  g.position.set(x, 0, wallZ);
  const panel = b.dynamicBox([width, 2.08, 0.05], [width / 2, 1.04, 0], 'wood');
  g.add(panel);
  const glass = new THREE.Mesh(new THREE.BoxGeometry(width * 0.55, 0.6, 0.055), b.mat('glassDark'));
  glass.position.set(width / 2, 1.55, 0);
  g.add(glass);
  if (interact) b.interactable(id, g);
  else b.add(g, id);
  b.collision.add(x, wallZ - 0.06, x + width, wallZ + 0.06, `${id}door`);
  b.openable(id, g, 0, `${id}door`, [-width * 0.92, 0, 0]);
  return g;
}

/** 古い鍵（床に落ちている物）。狙いやすいよう見えない当たり箱付き */
export function keyMesh(b: WorldBuilder): THREE.Group {
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
  key.add(b.hitShape([0.45, 0.2, 0.45], [0.03, 0, 0]));
  return key;
}

/**
 * 人の姿（おかっぱの女の子・店員・母親など）。原点が足元、正面は +z。
 * 箱ではなく、丸みのある形（カプセル・回転体・球）で組む。
 * skirt を省くと、背が低い子はスカート、大人はズボンになる。
 */
export function ghostFigure(opts: {
  hair: number;
  top: number;
  bottom: number;
  opacity: number;
  height?: number;
  skirt?: boolean;
  hairStyle?: 'bob' | 'short';
  /** 腕：下ろす（既定）か、胸の前で本を持つ */
  arms?: 'down' | 'book';
  /** 肌・靴下・靴の色（石像などは全部同じ色にする） */
  skin?: number;
  socks?: number;
  shoes?: number;
}): THREE.Group {
  const g = new THREE.Group();
  const height = opts.height ?? 1.25;
  // 体は身長 1.25m で作って、全体を縮尺する（外から足す目などは g の座標のまま）
  const body = new THREE.Group();
  body.scale.setScalar(height / 1.25);
  g.add(body);
  const child = height <= 1.4;
  const skirt = opts.skirt ?? child;
  const mat = (color: number, side: THREE.Side = THREE.FrontSide) =>
    new THREE.MeshLambertMaterial({ color, side, transparent: opts.opacity < 1, opacity: opts.opacity, emissive: color, emissiveIntensity: 0.12, depthWrite: opts.opacity >= 1 });
  const skin = mat(opts.skin ?? 0xd9cfc4);
  const top = mat(opts.top);
  const bottom = mat(opts.bottom);
  const add = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z = 0, rz = 0, rx = 0) => {
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(x, y, z);
    mesh.rotation.set(rx, 0, rz);
    body.add(mesh);
    return mesh;
  };
  const lathe = (pts: [number, number][], segs = 20) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), segs);

  // 足・脚（子どもは白い靴下）
  for (const side of [-1, 1]) {
    const x = side * 0.055;
    const shoe = add(new THREE.SphereGeometry(0.045, 12, 8), mat(opts.shoes ?? 0x1a1612), x, 0.025, 0.02);
    shoe.scale.set(0.85, 0.6, 1.5);
    if (skirt) {
      add(new THREE.CapsuleGeometry(0.033, 0.3, 4, 10), skin, x, 0.25);
      add(new THREE.CylinderGeometry(0.036, 0.034, 0.12, 10), mat(opts.socks ?? 0xe8e6de), x, 0.1);
    } else {
      add(new THREE.CapsuleGeometry(0.045, 0.42, 4, 10), bottom, x, 0.29);
    }
  }
  // 腰まわり：プリーツのスカート、またはズボンの腰
  if (skirt) {
    const sk = lathe([
      [0.0, 0.62],
      [0.118, 0.62],
      [0.15, 0.55],
      [0.19, 0.42],
      [0.2, 0.4],
    ], 32);
    const pos = sk.getAttribute('position');
    for (let k = 0; k < pos.count; k++) {
      const vx = pos.getX(k);
      const vz = pos.getZ(k);
      const t = (0.62 - pos.getY(k)) / 0.22;
      const f = 1 + 0.06 * t * Math.sin(Math.atan2(vz, vx) * 14);
      pos.setXYZ(k, vx * f, pos.getY(k), vz * f);
    }
    sk.computeVertexNormals();
    add(sk, mat(opts.bottom, THREE.DoubleSide), 0, 0);
  } else {
    add(lathe([[0.0, 0.5], [0.1, 0.5], [0.125, 0.56], [0.12, 0.64], [0.0, 0.64]]), bottom, 0, 0);
  }
  // 胴（ブラウス）・首・頭
  add(
    lathe([
      [0.0, 0.58],
      [0.112, 0.58],
      [0.124, 0.68],
      [0.135, 0.79],
      [0.128, 0.86],
      [0.095, 0.9],
      [0.035, 0.92],
      [0.0, 0.92],
    ]),
    top,
    0,
    0,
  ).scale.set(1, 1, 0.72);
  add(new THREE.CylinderGeometry(0.03, 0.033, 0.07, 10), skin, 0, 0.94);
  add(new THREE.SphereGeometry(0.095, 20, 16), skin, 0, 1.06).scale.set(0.95, 1.05, 0.98);
  // 腕：半袖（上腕は服の色）と、下ろした手
  for (const side of [-1, 1]) {
    if (opts.arms === 'book') {
      // 肘を曲げて、前腕を胸の前へ
      add(new THREE.CapsuleGeometry(0.032, 0.13, 4, 10), top, side * 0.155, 0.8, 0.02, side * 0.08, 0.25);
      add(new THREE.CapsuleGeometry(0.026, 0.14, 4, 10), skin, side * 0.12, 0.7, 0.1, side * -0.5, -1.35);
      add(new THREE.SphereGeometry(0.03, 10, 8), skin, side * 0.08, 0.72, 0.18);
    } else {
      add(new THREE.CapsuleGeometry(0.032, 0.13, 4, 10), top, side * 0.155, 0.8, 0, side * 0.08);
      add(new THREE.CapsuleGeometry(0.026, 0.15, 4, 10), skin, side * 0.168, 0.6, 0.01, side * 0.04);
      add(new THREE.SphereGeometry(0.03, 10, 8), skin, side * 0.172, 0.49, 0.015);
    }
  }
  // 髪：頭頂から眉までを覆い、横と後ろはあごの高さで切りそろえる（顔の前だけ開ける）
  const hair = mat(opts.hair, THREE.DoubleSide);
  const bob = (opts.hairStyle ?? 'bob') === 'bob';
  // 前髪は目の上まで。横と後ろは、頭の中心より少し上から下へ（すき間が出ないよう重ねる）
  add(new THREE.SphereGeometry(0.104, 24, 14, 0, Math.PI * 2, 0, bob ? 1.62 : 1.3), hair, 0, 1.065).scale.set(0.97, 1.05, 1.0);
  if (bob) {
    const len = 0.14;
    const topY = 1.085;
    add(new THREE.CylinderGeometry(0.104, 0.113, len, 24, 1, true, 0.62, Math.PI * 2 - 1.24), hair, 0, topY - len / 2);
  }
  return g;
}

/** 人体模型。原点が台座の中心、正面は +z。heart は胸の心臓（別に表示を切り替える） */
export function anatomyModel(b: WorldBuilder): { root: THREE.Group; heart: THREE.Mesh; keyInHand: THREE.Mesh } {
  const root = new THREE.Group();
  const skin = new THREE.MeshLambertMaterial({ color: 0xa8886c });
  const muscle = new THREE.MeshLambertMaterial({ map: muscleTexture() });
  const add = (w: number, h: number, d: number, x: number, y: number, z: number, m: THREE.Material) => {
    const p = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    p.position.set(x, y, z);
    root.add(p);
    return p;
  };
  add(0.5, 0.06, 0.5, 0, 0.03, 0, b.mat('metalGray'));
  add(0.03, 0.9, 0.03, 0, 0.5, -0.12, b.mat('metal'));
  // 脚
  add(0.11, 0.82, 0.12, -0.08, 0.47, 0, skin);
  add(0.11, 0.82, 0.12, 0.08, 0.47, 0, muscle);
  // 胴：左半分は皮膚、右半分は筋肉
  add(0.17, 0.6, 0.2, -0.085, 1.18, 0, skin);
  add(0.17, 0.6, 0.2, 0.085, 1.18, 0, muscle);
  // 心臓の穴
  add(0.08, 0.09, 0.02, -0.05, 1.3, 0.095, b.mat('dark'));
  // 腕
  add(0.07, 0.62, 0.08, -0.22, 1.12, 0, skin);
  add(0.07, 0.62, 0.08, 0.22, 1.12, 0.02, muscle);
  // 頭
  add(0.11, 0.24, 0.2, -0.055, 1.62, 0, skin);
  add(0.11, 0.24, 0.2, 0.055, 1.62, 0, muscle);
  // 剥き出しの目
  const eye = new THREE.MeshLambertMaterial({ color: 0xf0ece0, emissive: 0x222018 });
  add(0.035, 0.03, 0.02, -0.05, 1.65, 0.1, eye);
  add(0.035, 0.03, 0.02, 0.05, 1.65, 0.1, eye);
  const heart = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), new THREE.MeshLambertMaterial({ color: 0x9a1a1a }));
  heart.scale.set(1, 1.2, 0.8);
  heart.position.set(-0.05, 1.3, 0.1);
  root.add(heart);
  // 右手に握った鍵
  const keyInHand = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.1, 0.03), new THREE.MeshLambertMaterial({ color: 0xc9a54a, emissive: 0x3a2a08 }));
  keyInHand.position.set(0.22, 0.78, 0.05);
  root.add(keyInHand);
  root.add(b.hitShape([0.55, 1.8, 0.5], [0, 0.9, 0]));
  return { root, heart, keyInHand };
}

/** アップライトピアノ（正面は +x）。原点は鍵盤の中央の床 */
export function piano(b: WorldBuilder): THREE.Group {
  // アップライトピアノ：黒い艶のある本体、蓋、鍵盤（白鍵 52・黒鍵 36）、ペダル。正面は +x
  const g = new THREE.Group();
  const black = new THREE.MeshPhongMaterial({ color: 0x0b0b0d, specular: 0x8a8a8a, shininess: 90 });
  const add = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number) => {
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(x, y, z);
    g.add(mesh);
    return mesh;
  };
  add(new THREE.BoxGeometry(0.55, 1.25, 1.52), black, -0.33, 0.645, 0);
  add(new THREE.BoxGeometry(0.6, 0.03, 1.55), black, -0.31, 1.285, 0);
  add(new THREE.BoxGeometry(0.04, 0.5, 1.36), black, -0.04, 1.05, 0);
  add(new THREE.BoxGeometry(0.3, 0.08, 1.52), black, 0.05, 0.69, 0);
  for (const z of [-0.74, 0.74]) {
    add(new THREE.BoxGeometry(0.3, 0.2, 0.06), black, 0.05, 0.84, z);
    add(new THREE.BoxGeometry(0.07, 0.62, 0.07), black, 0.17, 0.31, z);
    add(new THREE.BoxGeometry(0.42, 0.05, 0.08), black, 0.02, 0.025, z);
  }
  // 鍵盤
  const white = new THREE.MeshStandardMaterial({ color: 0xf0ece0, roughness: 0.35 });
  const ebony = new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.3 });
  const kw = 1.36 / 52;
  const wk = new THREE.InstancedMesh(new THREE.BoxGeometry(0.14, 0.02, kw * 0.92), white, 52);
  const m = new THREE.Matrix4();
  for (let i = 0; i < 52; i++) wk.setMatrixAt(i, m.makeTranslation(0.13, 0.74, -0.68 + kw * (i + 0.5)));
  g.add(wk);
  const blackIdx: number[] = [];
  for (let i = 0; i < 51; i++) if (![2, 6].includes((i + 5) % 7)) blackIdx.push(i);
  const bk = new THREE.InstancedMesh(new THREE.BoxGeometry(0.085, 0.022, kw * 0.55), ebony, blackIdx.length);
  blackIdx.forEach((i, n) => bk.setMatrixAt(n, m.makeTranslation(0.1, 0.758, -0.68 + kw * (i + 1))));
  g.add(bk);
  // ペダル
  const brass = new THREE.MeshStandardMaterial({ color: 0xb8923a, roughness: 0.35, metalness: 0.8 });
  for (const z of [-0.08, 0, 0.08]) add(new THREE.BoxGeometry(0.1, 0.015, 0.03), brass, 0.02, 0.07, z);
  // 譜面
  const score = new THREE.Mesh(new THREE.PlaneGeometry(0.45, 0.3), new THREE.MeshLambertMaterial({ color: 0xe6e0cc }));
  score.rotation.y = Math.PI / 2;
  score.rotation.x = -0.2;
  score.position.set(-0.01, 1.0, 0);
  g.add(score);
  g.add(b.hitShape([0.9, 1.28, 1.6], [-0.1, 0.64, 0]));
  return g;
}

/** 実験台（黒い天板・流し付き） */
export function labTable(b: WorldBuilder, x: number, z: number): void {
  b.box([x - 0.9, 0, z - 0.6], [x + 0.9, 0.8, z + 0.6], 'locker', { collide: true });
  b.box([x - 0.95, 0.8, z - 0.65], [x + 0.95, 0.86, z + 0.65], 'dark');
  b.box([x - 0.25, 0.861, z - 0.2], [x + 0.25, 0.862, z + 0.2], 'metal');
  b.box([x - 0.03, 0.86, z - 0.3], [x + 0.03, 1.15, z - 0.26], 'metal');
  for (const [sx, sz] of [
    [-0.6, -0.95],
    [0.6, -0.95],
    [-0.6, 0.95],
    [0.6, 0.95],
  ]) {
    b.box([x + sx - 0.15, 0, z + sz - 0.15], [x + sx + 0.15, 0.06, z + sz + 0.15], 'metal');
    b.box([x + sx - 0.03, 0.06, z + sz - 0.03], [x + sx + 0.03, 0.55, z + sz + 0.03], 'metal');
    b.box([x + sx - 0.17, 0.55, z + sz - 0.17], [x + sx + 0.17, 0.6, z + sz + 0.17], 'wood');
  }
}

/** 職員室の事務机（灰色のスチール） */
export function officeDesk(b: WorldBuilder, x: number, z: number, papers: boolean): void {
  if (b.prop('metal_office_desk', [x, 0, z], 0, [0.62, 0.92, 0.78])) {
    b.collision.add(x - 0.62, z - 0.37, x + 0.62, z + 0.37);
  } else {
    b.box([x - 0.6, 0, z - 0.35], [x + 0.6, 0.7, z + 0.35], 'metalGray', { collide: true });
    b.box([x - 0.62, 0.7, z - 0.37], [x + 0.62, 0.73, z + 0.37], 'frame');
  }
  if (papers) {
    // 書類・ファイル・文房具（写真のモデル。なければ箱）
    const ok = b.prop('office_notepads', [x - 0.25, 0.73, z], 0.3, 0.45);
    b.prop('binder_notebook', [x + 0.3, 0.73, z - 0.15], 1.4, 0.8);
    b.prop('stationery_supplies', [x + 0.42, 0.73, z + 0.2], -0.5);
    if (!ok) {
      b.box([x - 0.4, 0.73, z - 0.2], [x - 0.05, 0.76, z + 0.15], 'porcelain');
      b.box([x + 0.15, 0.73, z - 0.25], [x + 0.45, 0.95, z - 0.05], 'dark');
    }
  }
}

/** 廊下の天井の梁（構造の柱の間隔で並ぶ）。蛍光灯と重ならない位置を渡す */
export function corridorBeams(b: WorldBuilder, xs: number[], zc: number): void {
  for (const x of xs) b.box([x - 0.16, H - 0.26, zc - 1.42], [x + 0.16, H - 0.002, zc + 1.42], 'storeWall');
}

/** 廊下の扉の穴 */
export const doorOpening = (from: number, width = 1.2): Opening => ({ from, to: from + width, top: 2.1 });
export const windowOpening = (from: number, to: number): Opening => ({ from, to, bottom: 0.9, top: 2.4 });

/** 救急箱（白い箱に赤十字）。原点は箱の底の中心 */
export function firstAidKit(b: WorldBuilder): THREE.Group {
  const g = new THREE.Group();
  const model = b.propObject('medical_box');
  if (model) {
    model.scale.setScalar(0.7);
    g.add(model);
    g.add(b.hitShape([0.45, 0.3, 0.35], [0, 0.1, 0]));
    return g;
  }
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.16, 0.22), b.mat('porcelain'));
  box.position.y = 0.08;
  g.add(box);
  const red = b.mat('red');
  const v = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.005, 0.14), red);
  v.position.y = 0.163;
  g.add(v);
  const h = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.005, 0.05), red);
  h.position.y = 0.163;
  g.add(h);
  g.add(b.hitShape([0.45, 0.3, 0.35], [0, 0.1, 0]));
  return g;
}

/** ザコ敵「影の子ども」：黒く半透明な子どもの形に、赤い目が二つ */
export function shadowChild(): THREE.Group {
  const g = ghostFigure({ hair: 0x050505, top: 0x0a0a0c, bottom: 0x0a0a0c, opacity: 0.82, height: 1.2 });
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff3020 });
  for (const x of [-0.045, 0.045]) {
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.02, 0.01), eyeMat);
    eye.position.set(x, 1.04, 0.1);
    g.add(eye);
  }
  return g;
}

/** 立てかけた竹刀（拾える物） */
export function shinaiProp(b: WorldBuilder): THREE.Group {
  const g = new THREE.Group();
  // 壁に立てかけた竹刀
  const s = shinaiMesh();
  s.rotation.z = 0.18;
  g.add(s);
  g.add(b.hitShape([0.4, 1.3, 0.4], [0, 0.6, 0]));
  return g;
}
