import * as THREE from 'three';
import { AudioEngine } from '../engine/audio';
import { CollisionWorld } from '../engine/collision';
import { Input } from '../engine/input';
import { LightRig } from '../engine/lights';
import { Player } from '../engine/player';
import { Dialogue } from '../ui/dialogue';
import { Hud } from '../ui/hud';
import { Notebook } from '../ui/notebook';
import { WorldBuilder } from '../world/builder';
import { createMaterials } from '../world/materials';
import { ScriptRunner } from './runner';
import { GameState } from './state';
import type { InteractableDef, StageDef } from './types';
import { validateStage } from './validate';

const INTERACT_DISTANCE = 2.5;
const OPEN_SECONDS = 1.4;

/** 1 ステージ分のゲーム本体：描画・入力・照準・ステージの組み立て */
export class Game {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly input: Input;
  readonly audio = new AudioEngine();
  readonly collision = new CollisionWorld();
  readonly lights: LightRig;
  readonly player: Player;
  readonly hud: Hud;
  readonly builder: WorldBuilder;
  readonly state: GameState;
  readonly dialogue = new Dialogue();
  readonly notebook: Notebook;
  readonly runner: ScriptRunner;
  private raycaster = new THREE.Raycaster();
  private center = new THREE.Vector2(0, 0);
  private defs = new Map<string, InteractableDef>();
  private target: InteractableDef | null = null;
  private timer = new THREE.Timer();
  private cleared = false;
  private debugEl: HTMLDivElement | null = null;
  private frames = 0;
  private fpsTime = 0;

  constructor(
    container: HTMLElement,
    readonly stage: StageDef,
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setClearColor(0x000000);
    container.appendChild(this.renderer.domElement);

    this.scene.fog = new THREE.FogExp2(0x020203, 0.07);
    this.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.05, 60);
    this.scene.add(this.camera);

    this.input = new Input(this.renderer.domElement);
    this.lights = new LightRig(this.scene, this.camera);
    this.player = new Player(this.camera, this.collision, this.input);
    this.player.onStep = () => this.audio.play('step');
    this.hud = new Hud(this.input);
    this.raycaster.far = INTERACT_DISTANCE;

    this.builder = new WorldBuilder(this.scene, this.collision, createMaterials());
    stage.build({ builder: this.builder, lights: this.lights });
    this.builder.finalize();
    for (const d of stage.interactables) this.defs.set(d.id, d);
    if (import.meta.env.DEV) {
      const errors = validateStage(stage, new Set(this.builder.named.keys()), new Set(this.builder.openables.keys()));
      for (const e of errors) console.error(`[stage ${stage.id}] ${e}`);
    }

    this.state = new GameState(stage);
    this.notebook = new Notebook(this.state);
    this.runner = new ScriptRunner({
      state: this.state,
      dialogue: this.dialogue,
      audio: this.audio,
      lights: this.lights,
      hud: this.hud,
      open: (name) => this.open(name),
      shake: () => this.shake(),
      clear: () => this.showClear(),
    });
    this.runner.onBusyChange = () => this.syncControls();
    this.notebook.onClose = () => this.syncControls();
    this.state.subscribe(() => this.syncState());
    this.syncState();

    const s = stage.start;
    this.player.place(s.x, s.z, s.yaw);

    window.addEventListener('resize', () => this.resize());
    this.input.onAction((a) => this.onAction(a));

    if (new URLSearchParams(location.search).has('debug')) {
      this.debugEl = document.createElement('div');
      this.debugEl.className = 'debug';
      document.body.appendChild(this.debugEl);
    }
    // タイトルの裏で 1 枚描いておく
    this.renderer.render(this.scene, this.camera);
  }

  start(): void {
    this.audio.unlock();
    this.audio.setHum(1);
    this.state.beginClock();
    this.hud.fade.style.transitionDuration = '0s';
    this.hud.fade.style.opacity = '1';
    this.renderer.setAnimationLoop((time) => this.frame(time));
    void this.runner.start(this.stage.intro);
  }

  private onAction(a: string): void {
    if (this.cleared) return;
    if (this.notebook.isOpen) {
      if (a === 'notebook' || a === 'cancel') this.notebook.close();
      return;
    }
    if (this.dialogue.active) {
      if (a === 'interact') this.dialogue.key('advance');
      else if (a === 'advance' || a === 'up' || a === 'down' || a === 'confirm') this.dialogue.key(a);
      return;
    }
    if (this.runner.busy) return;
    if (a === 'interact' && this.target) {
      void this.runner.interact(this.target);
    } else if (a === 'notebook') {
      this.notebook.open();
      this.syncControls();
    }
  }

  /** 会話中・手帳を開いている間は動けない */
  private syncControls(): void {
    const free = !this.runner.busy && !this.notebook.isOpen && !this.cleared;
    if (this.input.enabled !== free) {
      this.input.enabled = free;
      if (!free) this.input.reset();
    }
    this.hud.setVisible(!this.cleared);
    this.hud.root.classList.toggle('busy', !free);
  }

  /** 状態が変わったら、見た目（出現物・目的・手帳の印）を合わせる */
  private syncState(): void {
    for (const d of this.defs.values()) {
      if (!d.visibleWhen) continue;
      const obj = this.builder.named.get(d.id);
      if (obj) obj.visible = this.state.test(d.visibleWhen);
    }
    const obj = this.stage.objectives.find((o) => this.state.test(o.when));
    this.hud.setObjective(obj?.text ?? '');
    this.hud.setNoteCount(this.state.unreadNotes.size);
    // 名前が条件で変わる物のために照準をやり直す
    this.target = null;
    this.hud.setTarget(null);
  }

  private open(name: string): void {
    const o = this.builder.openables.get(name);
    if (!o) throw new Error(`unknown openable: ${name}`);
    o.opening = true;
    if (o.colliderTag) this.collision.setEnabled(o.colliderTag, false);
  }

  private shake(): void {
    const app = this.renderer.domElement;
    app.classList.remove('shake');
    void app.offsetWidth;
    app.classList.add('shake');
  }

  private showClear(): void {
    this.cleared = true;
    this.syncControls();
    const sec = Math.floor(this.state.elapsedSeconds());
    const time = `${Math.floor(sec / 60)}分${String(sec % 60).padStart(2, '0')}秒`;
    const screen = document.createElement('div');
    screen.className = 'screen';
    screen.innerHTML = `
      <div class="episode">${this.stage.episode}　${this.stage.title}</div>
      <h1>脱出成功</h1>
      <dl>
        <dt>調査時間</dt><dd>${time}</dd>
        <dt>記録数</dt><dd>${this.state.notes.length} / ${this.stage.notes.length}</dd>
      </dl>
      <div class="sub">花子さんは、今夜も三番目の個室で待っている。</div>
      <div class="tap">タップでもう一度</div>`;
    screen.style.opacity = '0';
    screen.style.transition = 'opacity 1.5s';
    document.body.appendChild(screen);
    requestAnimationFrame(() => (screen.style.opacity = '1'));
    setTimeout(() => screen.addEventListener('click', () => location.reload()), 1500);
  }

  private resize(): void {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  private frame(time: number): void {
    this.timer.update(time);
    const dt = Math.min(this.timer.getDelta(), 0.05);
    this.input.update();
    this.player.update(dt);
    this.lights.update(dt);
    this.updateOpenables(dt);
    if (this.input.enabled) this.updateTarget();
    else if (this.target) {
      this.target = null;
      this.hud.setTarget(null);
    }
    this.renderer.render(this.scene, this.camera);
    this.updateDebug(dt);
  }

  private updateOpenables(dt: number): void {
    for (const o of this.builder.openables.values()) {
      if (!o.opening || o.progress >= 1) continue;
      o.progress = Math.min(1, o.progress + dt / OPEN_SECONDS);
      // ゆっくり動き出して、最後にすっと止まる
      const t = o.progress;
      const ease = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      o.pivot.rotation.y = o.openRotY * ease;
    }
  }

  /** 画面中央から 2.5m 以内の、調べられる物を探す */
  private updateTarget(): void {
    this.raycaster.setFromCamera(this.center, this.camera);
    const objs = [...this.builder.occluders, ...this.builder.pickables];
    const hits = this.raycaster.intersectObjects(objs, true);
    let found: InteractableDef | null = null;
    for (const h of hits) {
      if (!isShown(h.object)) continue;
      const id = findInteractId(h.object);
      if (id) found = this.defs.get(id) ?? null;
      break; // 最初に当たった物だけ（壁の向こうは調べられない）
    }
    if (found !== this.target) {
      this.target = found;
      this.hud.setTarget(found ? this.nameOf(found) : null);
    }
  }

  private nameOf(d: InteractableDef): string {
    return d.names?.find((n) => this.state.test(n.when))?.name ?? d.name;
  }

  private updateDebug(dt: number): void {
    if (!this.debugEl) return;
    this.frames++;
    this.fpsTime += dt;
    if (this.fpsTime >= 0.5) {
      const p = this.player.pos;
      this.debugEl.textContent = `fps ${(this.frames / this.fpsTime).toFixed(0)}  x ${p.x.toFixed(2)} z ${p.z.toFixed(2)}  calls ${this.renderer.info.render.calls}`;
      this.frames = 0;
      this.fpsTime = 0;
    }
  }
}

function findInteractId(obj: THREE.Object3D | null): string | null {
  while (obj) {
    if (typeof obj.userData.interactId === 'string') return obj.userData.interactId;
    obj = obj.parent;
  }
  return null;
}

function isShown(obj: THREE.Object3D | null): boolean {
  while (obj) {
    if (!obj.visible) return false;
    obj = obj.parent;
  }
  return true;
}
