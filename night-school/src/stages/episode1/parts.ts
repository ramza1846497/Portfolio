import * as THREE from 'three';
import type { Opening, WorldBuilder } from '../../world/builder';
import { blackboardTexture, keysTexture, muscleTexture, noticeTexture, signTexture } from '../../engine/textures';

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
export function moonPatch(b: WorldBuilder, x1: number, x2: number, z1: number, z2: number): void {
  const geo = new THREE.PlaneGeometry(x2 - x1, z2 - z1);
  geo.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(geo, b.mat('moon'));
  m.position.set((x1 + x2) / 2, 0.006, (z1 + z2) / 2);
  m.renderOrder = 1;
  b.add(m);
}

export function sign(b: WorldBuilder, text: string, x: number, y: number, z: number, rotY: number, width: number): void {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(width, width * 0.375), new THREE.MeshLambertMaterial({ map: signTexture(text) }));
  m.position.set(x, y, z);
  m.rotation.y = rotY;
  b.add(m);
}

/** 壁に貼る板（貼り紙・落書き・肖像画など）。rotY で向きを決める */
export function wallPlane(b: WorldBuilder, tex: THREE.Texture, w: number, h: number, pos: [number, number, number], rotY: number, transparent = false): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshLambertMaterial({ map: tex, transparent }));
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
  b.box([x + facing * 0.1, 0.76, zc - 2.1], [x + facing * 0.22, 0.8, zc + 2.1], 'wood');
}

/** 机と椅子 1 組（黒板は -x 側）。fallen=true で椅子が倒れている */
export function desk(b: WorldBuilder, x: number, z: number, fallen: boolean): void {
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

/** 幽霊の姿（おかっぱの女の子など）。原点が足元 */
export function ghostFigure(opts: { hair: number; top: number; bottom: number; opacity: number; height?: number }): THREE.Group {
  const g = new THREE.Group();
  const s = (opts.height ?? 1.25) / 1.25;
  const mat = (color: number) =>
    new THREE.MeshLambertMaterial({ color, transparent: opts.opacity < 1, opacity: opts.opacity, emissive: color, emissiveIntensity: 0.12, depthWrite: opts.opacity >= 1 });
  const skin = mat(0xd9d4cc);
  const part = (w: number, h: number, d: number, y: number, m: THREE.Material, x = 0, z = 0) => {
    const p = new THREE.Mesh(new THREE.BoxGeometry(w * s, h * s, d * s), m);
    p.position.set(x * s, y * s, z * s);
    g.add(p);
  };
  part(0.07, 0.42, 0.07, 0.21, skin, -0.06);
  part(0.07, 0.42, 0.07, 0.21, skin, 0.06);
  part(0.32, 0.26, 0.24, 0.53, mat(opts.bottom));
  part(0.28, 0.3, 0.17, 0.8, mat(opts.top));
  part(0.06, 0.34, 0.06, 0.78, skin, -0.18);
  part(0.06, 0.34, 0.06, 0.78, skin, 0.18);
  part(0.2, 0.22, 0.19, 1.07, skin);
  // おかっぱ：頭の上・後ろ・横を覆い、前髪で目元を隠す
  const hair = mat(opts.hair);
  part(0.23, 0.08, 0.22, 1.19, hair);
  part(0.23, 0.22, 0.05, 1.08, hair, 0, -0.105);
  part(0.035, 0.22, 0.21, 1.07, hair, -0.115);
  part(0.035, 0.22, 0.21, 1.07, hair, 0.115);
  part(0.22, 0.07, 0.03, 1.13, hair, 0, 0.1);
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
  const g = new THREE.Group();
  const black = new THREE.MeshPhongMaterial({ color: 0x0c0c0e, specular: 0x666666, shininess: 70 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.3, 1.5), black);
  body.position.set(-0.3, 0.65, 0);
  g.add(body);
  const shelf = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.05, 1.5), black);
  shelf.position.set(0.12, 0.72, 0);
  g.add(shelf);
  const keys = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.18), new THREE.MeshLambertMaterial({ map: keysTexture() }));
  keys.rotation.x = -Math.PI / 2;
  keys.rotation.z = Math.PI / 2;
  keys.position.set(0.14, 0.751, 0);
  g.add(keys);
  for (const z of [-0.7, 0.7]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.72, 0.08), black);
    leg.position.set(0.22, 0.36, z);
    g.add(leg);
  }
  // 譜面
  const score = new THREE.Mesh(new THREE.PlaneGeometry(0.45, 0.3), new THREE.MeshLambertMaterial({ color: 0xe6e0cc }));
  score.rotation.y = Math.PI / 2;
  score.rotation.x = -0.2;
  score.position.set(0.01, 1.0, 0);
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
  b.box([x - 0.6, 0, z - 0.35], [x + 0.6, 0.7, z + 0.35], 'metalGray', { collide: true });
  b.box([x - 0.62, 0.7, z - 0.37], [x + 0.62, 0.73, z + 0.37], 'frame');
  if (papers) {
    b.box([x - 0.4, 0.73, z - 0.2], [x - 0.05, 0.76, z + 0.15], 'porcelain');
    b.box([x + 0.15, 0.73, z - 0.25], [x + 0.45, 0.95, z - 0.05], 'dark');
  }
}

/** 廊下の扉の穴 */
export const doorOpening = (from: number, width = 1.2): Opening => ({ from, to: from + width, top: 2.1 });
export const windowOpening = (from: number, to: number): Opening => ({ from, to, bottom: 0.9, top: 2.4 });
