import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/**
 * 外部の 3D モデル（public/models の .gltf.json と、そのテクスチャの .webp）。
 * 形のデータは JSON の中に base64 で入れてあり、読み込むときに自分でバイト列に戻して
 * GLB（バイナリの glTF）に組み直す。data: の URL や WebAssembly を使わないので、
 * 埋め込み先のページの制限（claude.ai など）でも読み込める。
 * 起動時にまとめて読み込み、ステージを組み立てるときに使う。読み込めなかった物は null のまま
 * （組み立て側は今までの箱で代わりに作る）。
 */
export class ModelLibrary {
  private models = new Map<string, THREE.Object3D>();

  async load(names: string[], onProgress?: (done: number, total: number) => void): Promise<void> {
    const loader = new GLTFLoader();
    let done = 0;
    await Promise.all(
      names.map(async (name) => {
        try {
          const res = await fetch(`./models/${name}.gltf.json`);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const gltf = await loader.parseAsync(toGlb(await res.json()), './models/');
          gltf.scene.updateMatrixWorld(true);
          // 透過（ガラス）の材質は、画面全体をもう一度描くので重い。うすい半透明に置き換える
          gltf.scene.traverse((o) => {
            if (!(o instanceof THREE.Mesh) || !(o.material instanceof THREE.MeshPhysicalMaterial) || o.material.transmission <= 0) return;
            const m = o.material;
            o.material = new THREE.MeshStandardMaterial({ color: m.color, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.15, depthWrite: false });
          });
          this.models.set(name, gltf.scene);
        } catch (e) {
          console.warn(`[models] could not load ${name}`, e);
        }
        onProgress?.(++done, names.length);
      }),
    );
  }

  get(name: string): THREE.Object3D | null {
    return this.models.get(name) ?? null;
  }

  /** モデルの中のメッシュを、モデルの原点から見た変形つきで列挙する */
  parts(name: string): { geometry: THREE.BufferGeometry; material: THREE.Material; matrix: THREE.Matrix4 }[] | null {
    const root = this.models.get(name);
    if (!root) return null;
    const inv = root.matrixWorld.clone().invert();
    const out: { geometry: THREE.BufferGeometry; material: THREE.Material; matrix: THREE.Matrix4 }[] = [];
    root.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      const material = Array.isArray(o.material) ? o.material[0] : o.material;
      out.push({ geometry: o.geometry, material, matrix: inv.clone().multiply(o.matrixWorld) });
    });
    return out;
  }
}

/** 使うモデルの一覧（public/models に置いた物。出典は CREDITS.md） */
export const MODEL_NAMES = [
  'SchoolDesk_01',
  'SchoolChair_01',
  'metal_office_desk',
  'old_bed_frame',
  'wall_clock',
  'steel_frame_shelves_01',
  'drawer_cabinet',
  'metal_trash_can',
  'wheelchair_01',
  'medical_box',
  'cardboard_box_01',
  'plastic_broom',
  'dustpan',
];

/** base64 で埋め込んだ buffer を取り出し、1 つの BIN にまとめた GLB を作る */
function toGlb(json: { buffers: { uri?: string; byteLength: number }[]; bufferViews?: { buffer: number; byteOffset?: number }[] }): ArrayBuffer {
  const pad4 = (n: number) => (n + 3) & ~3;
  const bins = json.buffers.map((b) => {
    const uri = b.uri ?? '';
    const bin = atob(uri.slice(uri.indexOf(',') + 1));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  });
  const starts: number[] = [];
  let total = 0;
  for (const b of bins) {
    starts.push(total);
    total += pad4(b.length);
  }
  for (const v of json.bufferViews ?? []) {
    v.byteOffset = (v.byteOffset ?? 0) + starts[v.buffer];
    v.buffer = 0;
  }
  json.buffers = [{ byteLength: total }];
  const jsonBytes = new TextEncoder().encode(JSON.stringify(json));
  const jsonLen = pad4(jsonBytes.length);
  const out = new ArrayBuffer(12 + 8 + jsonLen + 8 + total);
  const view = new DataView(out);
  const u8 = new Uint8Array(out);
  view.setUint32(0, 0x46546c67, true); // 'glTF'
  view.setUint32(4, 2, true);
  view.setUint32(8, out.byteLength, true);
  view.setUint32(12, jsonLen, true);
  view.setUint32(16, 0x4e4f534a, true); // 'JSON'
  u8.set(jsonBytes, 20);
  u8.fill(0x20, 20 + jsonBytes.length, 20 + jsonLen);
  const binStart = 20 + jsonLen;
  view.setUint32(binStart, total, true);
  view.setUint32(binStart + 4, 0x004e4942, true); // 'BIN'
  bins.forEach((b, i) => u8.set(b, binStart + 8 + starts[i]));
  return out;
}
