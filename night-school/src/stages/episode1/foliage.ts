import * as THREE from 'three';
import type { WorldBuilder } from '../../world/builder';
import { pbrMaterial } from '../../world/pbr';

/*
 * 木と植え込み：葉の茂みは、葉の形に抜いた板（葉っぱの絵）をたくさん重ねて作る。
 * 板の法線は茂みの中心から外向きにそろえ、ふっくらした陰影にする。全部の木で材質は 1 つ。
 */

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let leafMat: THREE.MeshStandardMaterial | null = null;
let barkMat: THREE.MeshStandardMaterial | null = null;

/** 葉っぱの房の絵（まわりは透明） */
function leafMaterial(): THREE.MeshStandardMaterial {
  if (leafMat) return leafMat;
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d')!;
  const rand = rng(3);
  // 細い枝
  ctx.strokeStyle = '#3a2a1a';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(S / 2, S);
  ctx.quadraticCurveTo(S * 0.45, S * 0.5, S * 0.55, S * 0.1);
  ctx.stroke();
  // 葉：大小の楕円を、枝のまわりに向きを散らして描く
  for (let i = 0; i < 150; i++) {
    const r = Math.sqrt(rand()) * S * 0.44;
    const a = rand() * Math.PI * 2;
    const x = S / 2 + Math.cos(a) * r;
    const y = S / 2 + Math.sin(a) * r * 0.95;
    const len = 14 + rand() * 16;
    const g = 70 + Math.floor(rand() * 70);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a + (rand() - 0.5) * 1.2);
    ctx.fillStyle = `rgb(${Math.floor(g * 0.45)},${g},${Math.floor(g * 0.35)})`;
    ctx.beginPath();
    ctx.ellipse(0, 0, len, len * 0.42, 0, 0, Math.PI * 2);
    ctx.fill();
    // 葉脈
    ctx.strokeStyle = `rgba(20,40,10,0.5)`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-len, 0);
    ctx.lineTo(len, 0);
    ctx.stroke();
    ctx.restore();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  leafMat = new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.85, metalness: 0, color: 0x7c8a74 });
  return leafMat;
}

/** 茂み：中心 c、半径 r（楕円体）の中に、葉の板を n 枚散らす */
function crown(b: WorldBuilder, c: THREE.Vector3, r: THREE.Vector3, n: number, size: number, rand: () => number): void {
  const geos: THREE.BufferGeometry[] = [];
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  for (let i = 0; i < n; i++) {
    // 外側寄りに置くと、すかすかに見えにくい
    const u = Math.cbrt(0.35 + rand() * 0.65);
    const th = rand() * Math.PI * 2;
    const ph = Math.acos(2 * rand() - 1);
    const p = new THREE.Vector3(Math.sin(ph) * Math.cos(th) * r.x * u, Math.cos(ph) * r.y * u, Math.sin(ph) * Math.sin(th) * r.z * u).add(c);
    const s = size * (0.7 + rand() * 0.6);
    const geo = new THREE.PlaneGeometry(s, s);
    q.setFromEuler(e.set(rand() * Math.PI, rand() * Math.PI * 2, rand() * Math.PI));
    m.compose(p, q, new THREE.Vector3(1, 1, 1));
    geo.applyMatrix4(m);
    // 法線は茂みの中心から外向き（ふっくら見える）
    const pos = geo.getAttribute('position');
    const nor = geo.getAttribute('normal');
    for (let k = 0; k < pos.count; k++) {
      const v = new THREE.Vector3(pos.getX(k) - c.x, (pos.getY(k) - c.y) * 0.7 + r.y * 0.3, pos.getZ(k) - c.z).normalize();
      nor.setXYZ(k, v.x, v.y, v.z);
    }
    geos.push(geo);
  }
  for (const g of geos) b.staticMesh(new THREE.Mesh(g, leafMaterial()));
}

/** 幹から枝分かれして、葉の茂みが三つ四つ重なった木。x, z は根もと */
export function leafyTree(b: WorldBuilder, x: number, z: number, seed: number): void {
  const rand = rng(seed);
  barkMat ??= pbrMaterial('bark', { repeat: 1 });
  const bark = barkMat;
  // 幹：根もとが太く、少し曲がる
  const h = 2.4 + rand() * 0.4;
  const lean = new THREE.Vector3((rand() - 0.5) * 0.3, 0, (rand() - 0.5) * 0.3);
  const trunk = new THREE.LatheGeometry(
    [
      [0.24, 0],
      [0.17, 0.15],
      [0.15, 0.6],
      [0.13, h * 0.7],
      [0.1, h],
      [0.0, h + 0.05],
    ].map(([r, y]) => new THREE.Vector2(r, y)),
    12,
  );
  const pos = trunk.getAttribute('position');
  for (let k = 0; k < pos.count; k++) {
    const t = pos.getY(k) / h;
    pos.setXYZ(k, pos.getX(k) + lean.x * t * t, pos.getY(k), pos.getZ(k) + lean.z * t * t);
  }
  trunk.computeVertexNormals();
  trunk.translate(x, 0, z);
  b.staticMesh(new THREE.Mesh(trunk, bark));
  b.collision.add(x - 0.2, z - 0.2, x + 0.2, z + 0.2);
  // 枝と、その先の茂み
  const top = new THREE.Vector3(x + lean.x, h, z + lean.z);
  crown(b, top.clone().add(new THREE.Vector3(0, 0.7, 0)), new THREE.Vector3(1.3, 0.9, 1.3), 46, 1.0, rand);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + rand();
    const len = 0.9 + rand() * 0.5;
    const from = new THREE.Vector3(x + lean.x * 0.6, h * (0.6 + rand() * 0.25), z + lean.z * 0.6);
    const to = from.clone().add(new THREE.Vector3(Math.cos(a) * len, 0.5 + rand() * 0.4, Math.sin(a) * len));
    const d = to.clone().sub(from);
    const br = new THREE.CylinderGeometry(0.03, 0.06, d.length(), 6);
    br.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize()));
    br.translate((from.x + to.x) / 2, (from.y + to.y) / 2, (from.z + to.z) / 2);
    b.staticMesh(new THREE.Mesh(br, bark));
    crown(b, to, new THREE.Vector3(0.8, 0.6, 0.8), 22, 0.85, rand);
  }
}

/** 植え込み：低い茂み（中心 x, z、幅 w、高さ h） */
export function hedge(b: WorldBuilder, x: number, z: number, w: number, d: number, h: number, seed: number): void {
  const rand = rng(seed);
  crown(b, new THREE.Vector3(x, h * 0.55, z), new THREE.Vector3(w / 2, h / 2, d / 2), Math.round(10 + w * 8), 0.6, rand);
}
