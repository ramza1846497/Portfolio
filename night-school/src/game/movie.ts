import * as THREE from 'three';
import type { AudioEngine, SfxName } from '../engine/audio';
import type { Player } from '../engine/player';
import type { Combat, DemoPose } from './combat';

/**
 * 敵の登場演出：プレイ画面のまま、敵の動きを見せる。
 *
 * 画面を切り替えたり説明を出したりはしない。プレイヤーの目のまま視線が敵に吸い寄せられ、
 * 敵が実際にその場で動いてみせる（予兆 → 攻撃 → 隙）。終わった位置・向きからそのまま操作に戻る。
 *
 * 中身は StageDef.movies に async 関数で書く（MovieApi を使う）。
 */
export type MovieScript = (m: MovieApi) => Promise<void>;

export type Vec3 = [number, number, number];

export interface MovieEnemy {
  readonly id: string;
  readonly root: THREE.Object3D;
  pose(p: DemoPose): void;
  /** 向きを (x, z) の方へ */
  face(x: number, z: number): void;
  /** (x, z) へ seconds 秒で動く。ease: 'in' は加速（飛びかかり・突進） */
  move(x: number, z: number, seconds: number, ease?: Ease): Promise<void>;
}

export interface MovieApi {
  enemy(id: string): MovieEnemy;
  /** 視線を target に向け続ける（y は狙う高さ、speed は追いかける速さ）。null で止める */
  look(target: MovieEnemy | Vec3 | null, y?: number, speed?: number): void;
  /** 画角を変える（寄る・戻す） */
  zoom(fov: number, seconds: number): Promise<void>;
  wait(seconds: number): Promise<void>;
  tween(seconds: number, fn: (k: number) => void): Promise<void>;
  sfx(name: SfxName): void;
  shake(power?: number): void;
  /** プレイヤーの立ち位置 */
  readonly player: { x: number; z: number };
}

type Ease = 'inOut' | 'in' | 'out' | 'linear';
const ease = (k: number, e: Ease): number =>
  e === 'linear' ? k : e === 'in' ? k * k : e === 'out' ? 1 - (1 - k) * (1 - k) : k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;

interface Tween {
  t: number;
  dur: number;
  fn: (k: number) => void;
  done: () => void;
}

export interface MovieHost {
  camera: THREE.PerspectiveCamera;
  player: Player;
  combat: Combat;
  audio: AudioEngine;
  isTouch: boolean;
}

const EYE = 1.5;

export class Movie {
  active = false;
  private skipping = false;
  private tweens: Tween[] = [];
  private target: { obj?: THREE.Object3D; point?: THREE.Vector3; y: number; speed: number } | null = null;
  private shakePower = 0;
  private savedFov = 70;
  private skipEl: HTMLDivElement;

  constructor(private host: MovieHost) {
    // 操作は止まっているので、どこをタップしても飛ばせる（小さく案内だけ出す）
    this.skipEl = document.createElement('div');
    this.skipEl.className = 'movie-skip';
    this.skipEl.textContent = `${host.isTouch ? 'タップ' : 'クリック / E'}でスキップ`;
    document.body.appendChild(this.skipEl);
    this.skipEl.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.skip();
    });
  }

  async play(script: MovieScript): Promise<void> {
    this.active = true;
    this.skipping = false;
    this.target = null;
    this.savedFov = this.host.camera.fov;
    this.skipEl.classList.add('on');
    try {
      await script(this.api());
    } finally {
      this.finish();
    }
  }

  skip(): void {
    if (!this.active || this.skipping) return;
    this.skipping = true;
    this.flush();
  }

  /** プレイヤーの更新のあとに呼ぶ（視線と揺れを上書きする） */
  update(dt: number): void {
    if (!this.active) return;
    for (const tw of [...this.tweens]) {
      tw.t += dt;
      const k = Math.min(1, tw.t / tw.dur);
      tw.fn(k);
      if (k >= 1) {
        this.tweens.splice(this.tweens.indexOf(tw), 1);
        tw.done();
      }
    }
    this.host.combat.demoUpdate(dt);

    // 視線：狙いの方へなめらかに向ける。プレイヤー自身の向きを動かすので、終わってもつながったまま
    const { player, camera } = this.host;
    if (this.target) {
      const t = this.target;
      const pt = t.obj ? t.obj.position : t.point!;
      const dx = pt.x - player.pos.x;
      const dz = pt.z - player.pos.z;
      const yaw = Math.atan2(-dx, -dz);
      const pitch = Math.max(-1.35, Math.min(1.35, Math.atan2(t.y - EYE, Math.hypot(dx, dz))));
      const k = Math.min(1, dt * t.speed);
      player.yaw += wrap(yaw - player.yaw) * k;
      player.pitch += (pitch - player.pitch) * k;
    }
    camera.rotation.set(player.pitch, player.yaw, 0);
    this.shakePower = Math.max(0, this.shakePower - dt * 2.5);
    if (this.shakePower > 0) {
      const s = this.shakePower * 0.06;
      camera.position.x += (Math.random() - 0.5) * s;
      camera.position.y += (Math.random() - 0.5) * s;
    }
  }

  private finish(): void {
    this.flush();
    this.host.combat.endDemo();
    this.host.camera.fov = this.savedFov;
    this.host.camera.updateProjectionMatrix();
    this.skipEl.classList.remove('on');
    this.target = null;
    this.active = false;
  }

  private flush(): void {
    while (this.tweens.length) {
      const tw = this.tweens.shift()!;
      tw.fn(1);
      tw.done();
    }
  }

  private tween(seconds: number, fn: (k: number) => void): Promise<void> {
    if (this.skipping || seconds <= 0) {
      fn(1);
      return Promise.resolve();
    }
    return new Promise((done) => this.tweens.push({ t: 0, dur: seconds, fn, done }));
  }

  private api(): MovieApi {
    const self = this;
    const { combat, audio, camera, player } = this.host;
    return {
      player: { x: player.pos.x, z: player.pos.z },
      enemy(id) {
        const root = combat.enemyRoot(id);
        return {
          id,
          root,
          pose: (p) => combat.demoPose(id, p),
          face(x, z) {
            root.rotation.y = Math.atan2(x - root.position.x, z - root.position.z);
          },
          move(x, z, seconds, e = 'inOut') {
            const x0 = root.position.x;
            const z0 = root.position.z;
            return self.tween(seconds, (k) => {
              const q = ease(k, e);
              root.position.x = x0 + (x - x0) * q;
              root.position.z = z0 + (z - z0) * q;
            });
          },
        };
      },
      look(target, y = 1.0, speed = 5) {
        if (!target) self.target = null;
        else if (Array.isArray(target)) self.target = { point: new THREE.Vector3(...target), y, speed };
        else self.target = { obj: target.root, y, speed };
      },
      zoom(fov, seconds) {
        const f0 = camera.fov;
        return self.tween(seconds, (k) => {
          camera.fov = f0 + (fov - f0) * ease(k, 'inOut');
          camera.updateProjectionMatrix();
        });
      },
      wait: (s) => self.tween(s, () => {}),
      tween: (s, fn) => self.tween(s, fn),
      sfx(name) {
        if (!self.skipping) audio.play(name);
      },
      shake(power = 1) {
        if (!self.skipping) self.shakePower = Math.max(self.shakePower, power);
      },
    };
  }
}

function wrap(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}
