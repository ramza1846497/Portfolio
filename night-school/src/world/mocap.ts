import * as THREE from 'three';
import type { Human } from './human';

/*
 * モーションキャプチャの動き（public/anim/mocap.json、tools/mocap_bake.py で CMU の動きを人体モデルの骨へ移した物）。
 * 人物ごとに AnimationMixer で再生し、状態が変わるときは前の動きと混ぜながら切り替える。
 */

interface ClipData {
  name: string;
  fps: number;
  loop: boolean;
  /** 1 秒に進む距離（腰の高さを 1 とした比） */
  speed: number;
  q: number[];
  root: number[];
}

interface MocapData {
  bones: string[];
  hipsRestY: number;
  clips: ClipData[];
}

let data: MocapData | null = null;

/** 起動時に読み込む（読み込めなかったら、今までの手続き的な動きのまま） */
export async function loadMocap(): Promise<void> {
  try {
    const res = await fetch('./anim/mocap.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    data = (await res.json()) as MocapData;
  } catch (e) {
    console.warn('[mocap] could not load', e);
  }
}

export function hasMocap(): boolean {
  return data !== null;
}

export interface PlayOptions {
  /** 前の動きから混ぜる時間（秒） */
  fade?: number;
  /** 再生の速さ */
  speed?: number;
  /** 最後まで行ったら止める（繰り返さない動き） */
  once?: boolean;
}

/** 一人ぶんの動きの再生 */
export class MocapPlayer {
  readonly mixer: THREE.AnimationMixer;
  private actions = new Map<string, THREE.AnimationAction>();
  private clipInfo = new Map<string, ClipData>();
  current: string | null = null;
  /** 腰の高さ（この人物の体つきで） */
  readonly hipsY: number;

  constructor(h: Human, only?: string[]) {
    const d = data!;
    this.mixer = new THREE.AnimationMixer(h.root);
    const hips = h.bones.hips;
    this.hipsY = hips.position.y;
    const restX = hips.position.x;
    const restZ = hips.position.z;
    const nb = d.bones.length;
    for (const c of d.clips) {
      const n = c.q.length / (nb * 4);
      const times = Float32Array.from({ length: n }, (_, i) => i / c.fps);
      const tracks: THREE.KeyframeTrack[] = [];
      d.bones.forEach((b, bi) => {
        if (only && !only.includes(b)) return;
        if (!h.bones[b]) return;
        const v = new Float32Array(n * 4);
        for (let i = 0; i < n; i++) for (let k = 0; k < 4; k++) v[i * 4 + k] = c.q[(i * nb + bi) * 4 + k];
        tracks.push(new THREE.QuaternionKeyframeTrack(`${b}.quaternion`, times, v));
      });
      if (!only || only.includes('hips')) {
        const p = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) {
          p[i * 3] = restX + c.root[i * 3] * this.hipsY;
          p[i * 3 + 1] = c.root[i * 3 + 1] * this.hipsY;
          p[i * 3 + 2] = restZ + c.root[i * 3 + 2] * this.hipsY;
        }
        tracks.push(new THREE.VectorKeyframeTrack('hips.position', times, p));
      }
      const clip = new THREE.AnimationClip(c.name, n / c.fps, tracks);
      const action = this.mixer.clipAction(clip);
      action.setLoop(c.loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
      action.clampWhenFinished = !c.loop;
      this.actions.set(c.name, action);
      this.clipInfo.set(c.name, c);
    }
  }

  /** 動きを切り替える（同じ動きなら何もしない） */
  play(name: string, o: PlayOptions = {}): void {
    const next = this.actions.get(name);
    if (!next) return;
    if (o.speed !== undefined) next.timeScale = o.speed;
    if (this.current === name) return;
    const prev = this.current ? this.actions.get(this.current) : null;
    next.reset();
    next.setEffectiveWeight(1);
    next.play();
    if (prev) prev.crossFadeTo(next, o.fade ?? 0.25, false);
    this.current = name;
  }

  setSpeed(s: number): void {
    const a = this.current ? this.actions.get(this.current) : null;
    if (a) a.timeScale = s;
  }

  /** 1 秒に進む距離（m）。この速さで動くとき、足が滑らない */
  clipSpeed(name: string): number {
    return (this.clipInfo.get(name)?.speed ?? 0.5) * this.hipsY;
  }

  /** 今の動きが最後まで行ったか（繰り返さない動き） */
  finished(): boolean {
    const a = this.current ? this.actions.get(this.current) : null;
    if (!a) return true;
    const c = this.clipInfo.get(this.current!)!;
    return !c.loop && a.time >= a.getClip().duration - 1e-3;
  }

  update(dt: number): void {
    this.mixer.update(dt);
  }
}
