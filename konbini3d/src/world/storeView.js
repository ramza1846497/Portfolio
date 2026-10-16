// 店の固定の見た目（壁・床・棚・レジ・フライヤーなど）を store.js のデータから作る。
// クリックで操作できる物には、見えない当たり用の箱（proxy）を重ねて userData.target を持たせる。

import * as THREE from 'three';
import {
  SOLIDS, SHELF_SECTIONS, DOOR, REGISTER_POS, HOTCASE_POS, FRYER_POS, TERMINAL_POS, MOP_STAND,
} from './store.js';

const materials = new Map();
export function mat(color, opts = {}) {
  const key = `${color}:${JSON.stringify(opts)}`;
  if (!materials.has(key)) materials.set(key, new THREE.MeshLambertMaterial({ color, ...opts }));
  return materials.get(key);
}

const proxyMaterial = new THREE.MeshBasicMaterial({ visible: false });

function addBox(parent, w, h, d, x, y, z, material) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

function textTexture(text, { bg = '#11847a', fg = '#ffffff', w = 512, h = 128, size = 64 } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = fg;
  ctx.font = `bold ${size}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, w / 2, h / 2 + 4);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function sign(parent, text, w, h, x, y, z, rotY = 0, opts) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: textTexture(text, opts) }));
  m.position.set(x, y, z);
  m.rotation.y = rotY;
  parent.add(m);
  return m;
}

function proxy(parent, w, h, d, x, y, z, target, list) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), proxyMaterial);
  m.position.set(x, y, z);
  m.userData.target = target;
  parent.add(m);
  list.push(m);
  return m;
}

const center = (b) => ({ x: (b.minX + b.maxX) / 2, z: (b.minZ + b.maxZ) / 2, w: b.maxX - b.minX, d: b.maxZ - b.minZ });

function buildShelf(root, solid, blockers) {
  const { x, z, w, d } = center(solid);
  const wood = mat(0xe8e2d6);
  blockers.push(addBox(root, w, 0.15, d, x, 0.075, z, mat(0x9aa3ab)));
  blockers.push(addBox(root, w, solid.h, 0.04, x, solid.h / 2, z, wood));
  for (const y of [0.48, 0.88, 1.28]) blockers.push(addBox(root, w, 0.03, d, x, y, z, wood));
  for (const ex of [solid.minX + 0.02, solid.maxX - 0.02]) blockers.push(addBox(root, 0.04, solid.h, d, ex, solid.h / 2, z, wood));
}

function buildFridge(root, solid, blockers) {
  const { x, z, w, d } = center(solid);
  const body = mat(0xdde5ea);
  blockers.push(addBox(root, w, solid.h, 0.05, x, solid.h / 2, solid.minZ + 0.03, mat(0x33424d)));
  blockers.push(addBox(root, w, 0.6, d, x, 0.3, z, body));
  blockers.push(addBox(root, w, 0.25, d, x, solid.h - 0.125, z, body));
  for (const y of [0.78, 1.28]) blockers.push(addBox(root, w, 0.03, d, x, y, z, mat(0xb8c4cc)));
  for (let i = 0; i <= 4; i++) blockers.push(addBox(root, 0.06, solid.h, d, solid.minX + 0.03 + (i * (w - 0.06)) / 4, solid.h / 2, z, body));
  // 中の明かり
  addBox(root, w - 0.1, 0.03, 0.03, x, solid.h - 0.27, solid.maxZ - 0.05, mat(0xffffff, { emissive: 0xffffff, emissiveIntensity: 0.9 }));
  const glass = new THREE.Mesh(
    new THREE.PlaneGeometry(w, solid.h - 0.85),
    new THREE.MeshLambertMaterial({ color: 0xcfe8f5, transparent: true, opacity: 0.18, depthWrite: false }),
  );
  glass.position.set(x, 0.6 + (solid.h - 0.85) / 2, solid.maxZ + 0.005);
  root.add(glass);
}

export function buildStore(scene) {
  const root = new THREE.Group();
  scene.add(root);
  const proxies = [];
  const blockers = [];

  // 地面・床・天井
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), mat(0x8fae74));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.02;
  root.add(ground);
  const sidewalk = new THREE.Mesh(new THREE.PlaneGeometry(16, 5), mat(0xa9a59c));
  sidewalk.rotation.x = -Math.PI / 2;
  sidewalk.position.set(0, -0.005, 7.6);
  root.add(sidewalk);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(12, 8), mat(0xeeebe4));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, 1);
  root.add(floor);
  const tiles = new THREE.GridHelper(12, 20, 0xd8d3c8, 0xd8d3c8);
  tiles.scale.z = 8 / 12;
  tiles.position.set(0, 0.002, 1);
  root.add(tiles);
  const backFloor = new THREE.Mesh(new THREE.PlaneGeometry(12, 2), mat(0xb9b4aa));
  backFloor.rotation.x = -Math.PI / 2;
  backFloor.position.set(0, 0, -4);
  root.add(backFloor);
  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(12.2, 10.2), mat(0xf7f7f4));
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(0, 3, 0);
  root.add(ceiling);
  for (const lz of [-1.5, 1.2, 3.8]) {
    for (const lx of [-3.5, 0, 3.5]) addBox(root, 1.6, 0.04, 0.3, lx, 2.98, lz, mat(0xffffff, { emissive: 0xffffff, emissiveIntensity: 1 }));
  }

  for (const s of SOLIDS) {
    const { x, z, w, d } = center(s);
    if (s.kind === 'wall') {
      blockers.push(addBox(root, w, s.h, d, x, s.h / 2, z, mat(s.id.startsWith('part') ? 0xe6e1d6 : 0xf3f0e9)));
    } else if (s.kind === 'shelf') {
      buildShelf(root, s, blockers);
    } else if (s.kind === 'fridge') {
      buildFridge(root, s, blockers);
    } else if (s.kind === 'counter') {
      blockers.push(addBox(root, w, s.h - 0.05, d, x, (s.h - 0.05) / 2, z, mat(0x7c5e45)));
      blockers.push(addBox(root, w + 0.04, 0.05, d + 0.06, x, s.h - 0.025, z, mat(0xece6da)));
      addBox(root, w, 0.12, 0.01, x, 0.55, s.minZ - 0.005, mat(0x11847a));
    } else if (s.kind === 'fryer') {
      blockers.push(addBox(root, w, s.h, d, x, s.h / 2, z, mat(0xb4bcc2)));
    } else if (s.kind === 'rack') {
      blockers.push(addBox(root, w, s.h, d, x, s.h / 2, z, mat(0xa8865c)));
    } else if (s.kind === 'desk') {
      blockers.push(addBox(root, w, 0.05, d, x, s.h, z, mat(0x8a8f96)));
      for (const lx of [s.minX + 0.05, s.maxX - 0.05]) addBox(root, 0.05, s.h, d - 0.1, lx, s.h / 2, z, mat(0x6b7077));
    }
  }

  // 自動ドアの上の壁と看板
  addBox(root, DOOR.width, 0.7, 0.1, DOOR.x, 2.65, 5.05, mat(0xf3f0e9));
  addBox(root, 12.2, 0.5, 0.06, 0, 2.55, 5.14, mat(0x11847a));
  addBox(root, 12.2, 0.12, 0.06, 0, 2.24, 5.14, mat(0xf08a24));
  sign(root, 'まいにちマート', 3.2, 0.5, -1.0, 2.55, 5.18, 0, { size: 72 });
  const doorMat = new THREE.MeshLambertMaterial({ color: 0xbfe0ef, transparent: true, opacity: 0.35, depthWrite: false });
  const doorL = new THREE.Mesh(new THREE.BoxGeometry(DOOR.width / 2, 2.3, 0.04), doorMat);
  const doorR = doorL.clone();
  doorL.position.set(DOOR.x - DOOR.width / 4, 1.15, 5.05);
  doorR.position.set(DOOR.x + DOOR.width / 4, 1.15, 5.05);
  root.add(doorL, doorR);
  for (const panel of [doorL, doorR]) {
    const edge = addBox(panel, 0.04, 2.3, 0.06, 0, 0, 0, mat(0x9aa3ab));
    edge.position.x = panel === doorL ? DOOR.width / 4 : -DOOR.width / 4;
  }

  // 売り場の札
  // 天井から下げる札（表裏2枚）
  const hanging = [
    ['飲料', -1.6, -1.9],
    ['おにぎり／パン', -3.1, -0.2],
    ['お菓子／日用品', 1.1, -0.2],
    ['レジ', REGISTER_POS.x, 2.1],
  ];
  for (const [text, x, z] of hanging) {
    addBox(root, 0.02, 0.4, 0.02, x, 2.8, z, mat(0x9aa3ab));
    sign(root, text, 1.4, 0.3, x, 2.5, z + 0.005, 0, { size: 64 });
    sign(root, text, 1.4, 0.3, x, 2.5, z - 0.005, Math.PI, { size: 64 });
  }
  sign(root, 'バックヤード', 1.1, 0.28, 4.2, 2.5, -2.88, 0, { size: 70 });

  // レジ
  const reg = new THREE.Group();
  reg.position.set(REGISTER_POS.x, REGISTER_POS.y, REGISTER_POS.z);
  root.add(reg);
  addBox(reg, 0.45, 0.14, 0.38, 0, 0.07, 0, mat(0x3c4247));
  const screen = addBox(reg, 0.32, 0.2, 0.03, 0, 0.27, 0.05, mat(0x1d2a24, { emissive: 0x2c6b46, emissiveIntensity: 0.8 }));
  screen.rotation.x = -0.3;
  addBox(reg, 0.18, 0.02, 0.1, 0.12, 0.15, -0.12, mat(0x222222));
  proxy(root, 0.7, 0.6, 0.7, REGISTER_POS.x, REGISTER_POS.y + 0.25, REGISTER_POS.z, { type: 'register' }, proxies);

  // ホットケース
  const hc = new THREE.Group();
  hc.position.set(HOTCASE_POS.x, HOTCASE_POS.y, HOTCASE_POS.z);
  root.add(hc);
  addBox(hc, 1.0, 0.06, 0.5, 0, 0.03, 0, mat(0x9aa3ab));
  addBox(hc, 1.0, 0.04, 0.5, 0, 0.5, 0, mat(0x9aa3ab));
  addBox(hc, 0.96, 0.02, 0.46, 0, 0.27, 0, mat(0xc9cfd3));
  const glass = new THREE.Mesh(
    new THREE.BoxGeometry(1.0, 0.46, 0.5),
    new THREE.MeshLambertMaterial({ color: 0xfff3d6, transparent: true, opacity: 0.2, depthWrite: false }),
  );
  glass.position.y = 0.27;
  hc.add(glass);
  addBox(hc, 0.96, 0.02, 0.02, 0, 0.47, 0.2, mat(0xffd9a0, { emissive: 0xffb050, emissiveIntensity: 0.8 }));
  proxy(root, 1.1, 0.6, 0.6, HOTCASE_POS.x, HOTCASE_POS.y + 0.28, HOTCASE_POS.z, { type: 'hotcase' }, proxies);
  sign(root, 'ホットスナック', 1.0, 0.18, HOTCASE_POS.x, HOTCASE_POS.y + 0.64, HOTCASE_POS.z - 0.26, Math.PI, { size: 64, bg: '#f08a24' });

  // フライヤー
  const oil = addBox(root, 0.7, 0.02, 0.4, FRYER_POS.x, FRYER_POS.y + 0.005, FRYER_POS.z, mat(0x8a6a1f));
  addBox(root, 0.8, 0.12, 0.05, FRYER_POS.x, FRYER_POS.y + 0.06, FRYER_POS.z - 0.3, mat(0x9aa3ab));
  proxy(root, 1.0, 0.5, 0.7, FRYER_POS.x, FRYER_POS.y + 0.2, FRYER_POS.z, { type: 'fryer' }, proxies);
  sign(root, 'フライヤー', 0.8, 0.18, FRYER_POS.x, 1.6, 4.94, Math.PI, { size: 64, bg: '#7c5e45' });

  // 発注端末
  addBox(root, 0.45, 0.32, 0.04, TERMINAL_POS.x, TERMINAL_POS.y + 0.25, TERMINAL_POS.z - 0.1, mat(0x1d2a33, { emissive: 0x2a5d8f, emissiveIntensity: 0.9 }));
  addBox(root, 0.06, 0.1, 0.06, TERMINAL_POS.x, TERMINAL_POS.y + 0.06, TERMINAL_POS.z - 0.12, mat(0x333333));
  proxy(root, 0.8, 0.7, 0.7, TERMINAL_POS.x, TERMINAL_POS.y + 0.2, TERMINAL_POS.z, { type: 'terminal' }, proxies);
  sign(root, '発注端末', 0.7, 0.18, TERMINAL_POS.x, 1.45, -4.97, 0, { size: 64, bg: '#2a5d8f' });

  // モップ置き場（バケツ）
  const bucket = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.15, 0.3, 14), mat(0x3b82c4));
  bucket.position.set(MOP_STAND.x, 0.15, MOP_STAND.z);
  root.add(bucket);

  // 棚の区画（補充・確認用の当たり）
  for (const s of SHELF_SECTIONS) {
    const top = Math.max(...s.levels) + 0.25;
    const bottom = Math.min(...s.levels) - 0.25;
    proxy(root, s.width, top - bottom, 0.34, s.x, (top + bottom) / 2, s.faceZ - s.dir * 0.12, { type: 'shelf', id: s.productId }, proxies);
  }

  return { root, proxies, blockers, door: { left: doorL, right: doorR }, oil };
}
