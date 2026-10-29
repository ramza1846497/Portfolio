import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

/**
 * 外部の 3D モデル（public/models の .glb）。
 * 起動時にまとめて読み込み、ステージを組み立てるときに使う。読み込めなかった物は null のまま
 * （組み立て側は今までの箱で代わりに作る）。
 */
export class ModelLibrary {
  private models = new Map<string, THREE.Object3D>();

  async load(names: string[], onProgress?: (done: number, total: number) => void): Promise<void> {
    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    let done = 0;
    await Promise.all(
      names.map(async (name) => {
        try {
          const gltf = await loader.loadAsync(`./models/${name}.glb`);
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
