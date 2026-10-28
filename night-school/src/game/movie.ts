import * as THREE from 'three';
import type { AudioEngine, SfxName } from '../engine/audio';
import type { Combat, DemoPose } from './combat';

/**
 * ショートムービー：敵の動きを、映像で端的に見せる。
 *
 * アクションゲームの「敵紹介」「操作のお手本」の作法にならう。
 *  - 上下に黒帯、HUD は消す。画面は少し色を抜いて「予感（イメージ）」として見せる
 *  - 最初に名前のカード。説明は一行のキャプションと、押すボタンの印だけ
 *  - 予兆（赤い光と「！」）→ 回避（残像）→ 隙を叩く（ヒットストップ・火花）を、スロー込みで実演
 *  - 最後に「予兆 ▶ 回避 ▶ 攻撃」の流れを一枚で見せる
 *  - タップでいつでも飛ばせる
 *
 * ムービーの中身は StageDef.movies に async 関数で書く（MovieApi を使う）。
 */
export type MovieScript = (m: MovieApi) => Promise<void>;

export type Vec3 = [number, number, number];

export interface MovieEnemy {
  readonly id: string;
  readonly root: THREE.Object3D;
  pose(p: DemoPose): void;
  /** 向きを (x, z) の方へ */
  face(x: number, z: number): void;
  place(x: number, z: number): void;
  /** (x, z) へ seconds 秒で動く。ease: 'in' は加速（飛びかかり・突進） */
  move(x: number, z: number, seconds: number, ease?: Ease): Promise<void>;
}

export interface MovieGhost {
  readonly root: THREE.Object3D;
  face(x: number, z: number): void;
  move(x: number, z: number, seconds: number): Promise<void>;
  /** すばやく身をかわす（残像を残す） */
  dodge(x: number, z: number): Promise<void>;
  /** 竹刀で打つ。当たった瞬間にヒットストップと火花 */
  strike(target: MovieEnemy, heavy?: boolean): Promise<void>;
}

export interface MovieApi {
  /** 敵の名前のカード（seconds 秒出して消える。待たない） */
  title(name: string, sub: string, seconds?: number): void;
  /** 画面下の一行。{attack} {dodge} は押すボタンの印になる。'' で消す */
  caption(text: string): void;
  /** 最後のまとめ：「予兆 ▶ 回避 ▶ 攻撃」 */
  recap(steps: string[], seconds?: number): Promise<void>;
  /** カメラ。seconds = 0 で切り替え、それ以外はなめらかに動かす */
  cam(pos: Vec3, look: Vec3, seconds?: number): Promise<void>;
  wait(seconds: number): Promise<void>;
  tween(seconds: number, fn: (k: number) => void): Promise<void>;
  /** 時間の流れ（1 = 通常、0.3 = スロー） */
  slow(scale: number): void;
  sfx(name: SfxName): void;
  shake(power?: number): void;
  enemy(id: string): MovieEnemy;
  /** プレイヤーの立ち位置（カメラの置き場所を決めるのに使う） */
  readonly player: { x: number; z: number };
  /** お手本の人影（主人公の予感の姿） */
  ghost(x: number, z: number, faceX: number, faceZ: number): MovieGhost;
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
  scene: THREE.Scene;
  combat: Combat;
  audio: AudioEngine;
  isTouch: boolean;
  player: { x: number; z: number };
}

const FOV = 50;

export class Movie {
  active = false;
  private skipping = false;
  private scale = 1;
  private hitStop = 0;
  private tweens: Tween[] = [];
  private camPos = new THREE.Vector3();
  private camLook = new THREE.Vector3();
  private shakePower = 0;
  private props: THREE.Object3D[] = [];
  private saved = new Map<THREE.Object3D, { pos: THREE.Vector3; rot: THREE.Euler; scale: THREE.Vector3; visible: boolean }>();
  private root: HTMLDivElement;
  private titleEl: HTMLDivElement;
  private captionEl: HTMLDivElement;
  private recapEl: HTMLDivElement;
  private savedFov = 70;
  /** ムービーの間だけ足す、うすい補助光（暗がりの敵も見えるように） */
  private fill = new THREE.HemisphereLight(0x7a88aa, 0x1a1612, 1.1);

  constructor(private host: MovieHost) {
    this.root = document.createElement('div');
    this.root.className = 'movie';
    this.root.innerHTML = `
      <div class="bar top"><span class="tag">予感</span><span class="skip">${host.isTouch ? 'タップ' : 'クリック / E'}でスキップ ▶▶</span></div>
      <div class="bar bottom"></div>
      <div class="mv-title"><div class="name"></div><div class="sub"></div></div>
      <div class="mv-caption"></div>
      <div class="mv-recap"></div>`;
    this.titleEl = this.root.querySelector('.mv-title')!;
    this.captionEl = this.root.querySelector('.mv-caption')!;
    this.recapEl = this.root.querySelector('.mv-recap')!;
    document.body.appendChild(this.root);
    this.root.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.skip();
    });
  }

  async play(script: MovieScript): Promise<void> {
    const { camera } = this.host;
    this.active = true;
    this.skipping = false;
    this.scale = 1;
    this.hitStop = 0;
    this.savedFov = camera.fov;
    camera.fov = FOV;
    camera.updateProjectionMatrix();
    camera.getWorldPosition(this.camPos);
    this.camLook.copy(this.camPos).add(camera.getWorldDirection(new THREE.Vector3()));
    this.titleEl.classList.remove('on');
    this.captionEl.classList.remove('on');
    this.recapEl.classList.remove('on');
    this.root.classList.add('on');
    document.body.classList.add('movie-on');
    this.host.scene.add(this.fill);
    try {
      await script(this.api());
      if (!this.skipping) await this.wait(0.3);
    } finally {
      this.finish();
    }
  }

  /** 残りを一気に済ませる */
  skip(): void {
    if (!this.active || this.skipping) return;
    this.skipping = true;
    this.flush();
  }

  update(dt: number): void {
    if (!this.active) return;
    let d = dt * this.scale;
    if (this.hitStop > 0) {
      this.hitStop -= dt;
      d = 0;
    }
    for (const tw of [...this.tweens]) {
      tw.t += d;
      const k = Math.min(1, tw.t / tw.dur);
      tw.fn(k);
      if (k >= 1) {
        this.tweens.splice(this.tweens.indexOf(tw), 1);
        tw.done();
      }
    }
    this.host.combat.demoUpdate(dt);
    // カメラ（揺れつき）
    const cam = this.host.camera;
    this.shakePower = Math.max(0, this.shakePower - dt * 2.5);
    const s = this.shakePower * 0.08;
    cam.position.copy(this.camPos).add(new THREE.Vector3((Math.random() - 0.5) * s, (Math.random() - 0.5) * s, (Math.random() - 0.5) * s));
    cam.lookAt(this.camLook);
  }

  private finish(): void {
    this.flush();
    for (const p of this.props) p.removeFromParent();
    this.props = [];
    for (const [o, s] of this.saved) {
      o.position.copy(s.pos);
      o.rotation.copy(s.rot);
      o.scale.copy(s.scale);
      o.visible = s.visible;
    }
    this.saved.clear();
    this.host.combat.endDemo();
    this.fill.removeFromParent();
    this.host.camera.fov = this.savedFov;
    this.host.camera.updateProjectionMatrix();
    this.root.classList.remove('on');
    document.body.classList.remove('movie-on');
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

  private wait(seconds: number): Promise<void> {
    return this.tween(seconds, () => {});
  }

  private remember(o: THREE.Object3D): void {
    if (!this.saved.has(o)) this.saved.set(o, { pos: o.position.clone(), rot: o.rotation.clone(), scale: o.scale.clone(), visible: o.visible });
  }

  private chip(text: string): string {
    const t = this.host.isTouch;
    return text
      .replace('{attack}', `<span class="chip attack">${t ? '攻撃' : 'F'}</span>`)
      .replace('{dodge}', `<span class="chip dodge">${t ? '回避' : 'Shift'}</span>`);
  }

  private api(): MovieApi {
    const self = this;
    const { combat, audio } = this.host;
    const moveObj = (o: THREE.Object3D, x: number, z: number, seconds: number, e: Ease) => {
      const x0 = o.position.x;
      const z0 = o.position.z;
      return self.tween(seconds, (k) => {
        const q = ease(k, e);
        o.position.x = x0 + (x - x0) * q;
        o.position.z = z0 + (z - z0) * q;
      });
    };
    const sfx = (name: SfxName) => {
      if (!self.skipping) audio.play(name);
    };
    const faceObj = (o: THREE.Object3D, x: number, z: number) => {
      o.rotation.y = Math.atan2(x - o.position.x, z - o.position.z);
    };
    return {
      player: { x: this.host.player.x, z: this.host.player.z },
      title(name, sub, seconds = 2.4) {
        self.titleEl.querySelector('.name')!.textContent = name;
        self.titleEl.querySelector('.sub')!.textContent = sub;
        self.titleEl.classList.add('on');
        void self.wait(seconds).then(() => self.titleEl.classList.remove('on'));
      },
      caption(text) {
        self.captionEl.classList.toggle('on', text !== '');
        if (text) self.captionEl.innerHTML = self.chip(text);
      },
      async recap(steps, seconds = 2.2) {
        self.captionEl.classList.remove('on');
        self.recapEl.innerHTML = steps.map((s) => `<span class="step">${self.chip(s)}</span>`).join('<span class="arrow">▶</span>');
        self.recapEl.classList.add('on');
        await self.wait(seconds);
        self.recapEl.classList.remove('on');
      },
      cam(pos, look, seconds = 0) {
        const p0 = self.camPos.clone();
        const l0 = self.camLook.clone();
        const p1 = new THREE.Vector3(...pos);
        const l1 = new THREE.Vector3(...look);
        return self.tween(seconds, (k) => {
          const q = ease(k, 'inOut');
          self.camPos.lerpVectors(p0, p1, q);
          self.camLook.lerpVectors(l0, l1, q);
        });
      },
      wait: (s) => self.wait(s),
      tween: (s, fn) => self.tween(s, fn),
      slow(scale) {
        self.scale = scale;
      },
      sfx(name) {
        if (!self.skipping) audio.play(name);
      },
      shake(power = 1) {
        if (!self.skipping) self.shakePower = Math.max(self.shakePower, power);
      },
      enemy(id) {
        const root = combat.enemyRoot(id);
        self.remember(root);
        root.visible = true;
        return {
          id,
          root,
          pose: (p) => combat.demoPose(id, p),
          face: (x, z) => faceObj(root, x, z),
          place(x, z) {
            root.position.x = x;
            root.position.z = z;
          },
          move: (x, z, s, e = 'inOut') => moveObj(root, x, z, s, e),
        };
      },
      ghost(x, z, fx, fz) {
        const g = makeGhost();
        g.root.position.set(x, 0, z);
        faceObj(g.root, fx, fz);
        self.host.scene.add(g.root);
        self.props.push(g.root);
        // ふっと現れる
        void self.tween(0.4, (k) => g.setOpacity(GHOST_OPACITY * k));
        const ghost: MovieGhost = {
          root: g.root,
          face: (tx, tz) => faceObj(g.root, tx, tz),
          move: (tx, tz, s) => moveObj(g.root, tx, tz, s, 'inOut'),
          async dodge(tx, tz) {
            sfx('dodge');
            const from = g.root.position.clone();
            const steps = [0.25, 0.55, 0.85];
            const shown = new Set<number>();
            await self.tween(0.2, (k) => {
              const q = ease(k, 'out');
              g.root.position.x = from.x + (tx - from.x) * q;
              g.root.position.z = from.z + (tz - from.z) * q;
              // 残像を置いていく
              for (const s of steps) {
                if (k >= s && !shown.has(s)) {
                  shown.add(s);
                  const after = g.afterimage();
                  self.host.scene.add(after.root);
                  self.props.push(after.root);
                  void self.tween(0.45, (f) => after.setOpacity(0.22 * (1 - f)));
                }
              }
            });
          },
          async strike(target, heavy = false) {
            sfx('swing');
            // 振りかぶって、振りおろす
            await self.tween(0.14, (k) => (g.arms.rotation.x = REST + (RAISED - REST) * ease(k, 'out')));
            await self.tween(0.08, (k) => (g.arms.rotation.x = RAISED + (STRUCK - RAISED) * ease(k, 'in')));
            // 当たった瞬間：止める・光る・火花・揺れ
            sfx('hit');
            combat.demoFlash(target.id);
            if (!self.skipping) self.hitStop = heavy ? 0.12 : 0.07;
            spark(target);
            if (heavy) self.shakePower = Math.max(self.shakePower, 0.6);
            const r = target.root;
            const dx = r.position.x - g.root.position.x;
            const dz = r.position.z - g.root.position.z;
            const d = Math.max(Math.hypot(dx, dz), 1e-3);
            void moveObj(r, r.position.x + (dx / d) * 0.15, r.position.z + (dz / d) * 0.15, 0.12, 'out');
            await self.tween(0.22, (k) => (g.arms.rotation.x = STRUCK + (REST - STRUCK) * ease(k, 'inOut')));
          },
        };
        return ghost;
      },
    };

    function spark(target: MovieEnemy): void {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: sparkTexture(), blending: THREE.AdditiveBlending, depthTest: false, transparent: true }));
      const box = new THREE.Box3().setFromObject(target.root);
      s.position.set(target.root.position.x, box.min.y + (box.max.y - box.min.y) * 0.6, target.root.position.z);
      s.renderOrder = 11;
      self.host.scene.add(s);
      self.props.push(s);
      void self.tween(0.25, (k) => {
        s.scale.setScalar(0.3 + k * 0.9);
        s.material.opacity = 1 - k;
        s.material.rotation = k;
      });
    }
  }
}

// ---------------- お手本の人影 ----------------

const GHOST_OPACITY = 0.42;
/** 腕と竹刀の角度：構え・振りかぶり・振りおろし */
const REST = -0.35;
const RAISED = -2.1;
const STRUCK = 0.45;

interface Ghost {
  root: THREE.Group;
  arms: THREE.Group;
  setOpacity(o: number): void;
  afterimage(): { root: THREE.Object3D; setOpacity(o: number): void };
}

/** 主人公の姿：半透明の青白い人影が、竹刀を構えている。原点は足元、正面は +z */
function makeGhost(): Ghost {
  const mat = new THREE.MeshBasicMaterial({ color: 0xa8c8ff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  const root = new THREE.Group();
  const part = (parent: THREE.Object3D, w: number, h: number, d: number, x: number, y: number, z: number) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  };
  part(root, 0.13, 0.82, 0.15, -0.1, 0.41, 0);
  part(root, 0.13, 0.82, 0.15, 0.1, 0.41, 0);
  part(root, 0.42, 0.62, 0.22, 0, 1.13, 0);
  part(root, 0.21, 0.24, 0.22, 0, 1.6, 0);
  // 両腕と竹刀（肩を軸に回す）
  const arms = new THREE.Group();
  arms.position.set(0, 1.36, 0.08);
  arms.rotation.x = REST;
  part(arms, 0.36, 0.09, 0.42, 0, 0, 0.2);
  part(arms, 0.035, 0.035, 1.05, 0, 0, 0.9);
  root.add(arms);
  return {
    root,
    arms,
    setOpacity: (o) => (mat.opacity = o),
    afterimage() {
      const m2 = mat.clone();
      const copy = root.clone(true);
      copy.traverse((o) => {
        if (o instanceof THREE.Mesh) o.material = m2;
      });
      return { root: copy, setOpacity: (o) => (m2.opacity = o) };
    },
  };
}

let sparkTex: THREE.Texture | null = null;
/** 打撃の火花：白い十字の光 */
function sparkTexture(): THREE.Texture {
  if (sparkTex) return sparkTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.2, 'rgba(255,240,200,0.8)');
  g.addColorStop(1, 'rgba(255,200,120,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  for (const [w, h] of [
    [120, 6],
    [6, 120],
  ]) ctx.fillRect(64 - w / 2, 64 - h / 2, w, h);
  sparkTex = new THREE.CanvasTexture(c);
  return sparkTex;
}
