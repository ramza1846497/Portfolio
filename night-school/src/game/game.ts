import * as THREE from 'three';
import { AudioEngine } from '../engine/audio';
import { CollisionWorld } from '../engine/collision';
import { Input } from '../engine/input';
import { LightRig } from '../engine/lights';
import { Player } from '../engine/player';
import { Dialogue } from '../ui/dialogue';
import { Hud } from '../ui/hud';
import { Keypad } from '../ui/keypad';
import { Notebook } from '../ui/notebook';
import { WorldBuilder } from '../world/builder';
import { createMaterials } from '../world/materials';
import { ScriptRunner } from './runner';
import { GameState } from './state';
import type { Actor, ActorContext, InteractableDef, StageDef } from './types';
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
  readonly keypad = new Keypad();
  private actors = new Map<string, Actor>();
  /** 発火済みのトリガー */
  private firedTriggers = new Set<string>();
  /** いま中にいるトリガー（入り直したときだけ再発火させる） */
  private insideTriggers = new Set<string>();
  private losRay = new THREE.Raycaster();
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
      const errors = validateStage(stage, {
        objects: new Set(this.builder.named.keys()),
        openables: new Set(this.builder.openables.keys()),
        spawns: new Set(this.builder.spawns.keys()),
      });
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
      keypad: this.keypad,
      open: (name) => this.open(name),
      teleport: (name) => this.teleport(name),
      look: (name) => this.lookAt(name),
      actorCommand: (id, cmd) => {
        const actor = this.actors.get(id);
        if (!actor) throw new Error(`unknown actor: ${id}`);
        actor.command?.(cmd);
      },
      shake: () => this.shake(),
      clear: (title, text) => this.showClear(title, text),
    });
    this.runner.onBusyChange = () => this.syncControls();
    this.keypad.onPress = (key, style) => (style === 'piano' ? this.audio.note(key) : this.audio.play('click'));

    const actorCtx: ActorContext = {
      builder: this.builder,
      collision: this.collision,
      camera: this.camera,
      state: this.state,
      audio: this.audio,
      playerPos: this.player.pos,
      lineOfSight: (from, to) => this.lineOfSight(from, to),
      run: (actions) => void this.runner.start(actions),
    };
    for (const a of stage.actors ?? []) this.actors.set(a.id, a.create(actorCtx));
    this.notebook.onClose = () => this.syncControls();
    this.state.subscribe(() => this.syncState());
    this.syncState();

    const s = this.builder.spawns.get('start') ?? stage.start;
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
    if (this.keypad.active) return;
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
    for (const v of this.stage.visibility ?? []) {
      const obj = this.builder.named.get(v.id);
      if (obj) obj.visible = this.state.test(v.when);
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

  private teleport(name: string): void {
    const s = this.builder.spawns.get(name);
    if (!s) throw new Error(`unknown spawn: ${name}`);
    this.player.place(s.x, s.z, s.yaw);
    // 移った先のトリガーがすぐ発火しないように、いる場所を「中にいる」扱いにする
    this.insideTriggers.clear();
    for (const t of this.stage.triggers ?? []) if (this.inArea(t.area)) this.insideTriggers.add(t.id);
  }

  private lookAt(name: string): Promise<void> {
    const obj = this.builder.named.get(name);
    if (!obj) throw new Error(`unknown object: ${name}`);
    const target = new THREE.Box3().setFromObject(obj).getCenter(new THREE.Vector3());
    const p = this.player;
    const dx = target.x - p.pos.x;
    const dz = target.z - p.pos.z;
    let yaw = Math.atan2(-dx, -dz);
    // 近い方向に回る
    while (yaw - p.yaw > Math.PI) yaw -= Math.PI * 2;
    while (yaw - p.yaw < -Math.PI) yaw += Math.PI * 2;
    const pitch = Math.atan2(target.y - 1.5, Math.hypot(dx, dz));
    const from = { yaw: p.yaw, pitch: p.pitch };
    const start = performance.now();
    const dur = 450;
    return new Promise((resolve) => {
      const step = () => {
        const t = Math.min(1, (performance.now() - start) / dur);
        const e = 1 - Math.pow(1 - t, 3);
        p.yaw = from.yaw + (yaw - from.yaw) * e;
        p.pitch = from.pitch + (pitch - from.pitch) * e;
        if (t < 1) requestAnimationFrame(step);
        else resolve();
      };
      requestAnimationFrame(step);
    });
  }

  private inArea(a: { minX: number; maxX: number; minZ: number; maxZ: number }): boolean {
    const p = this.player.pos;
    return p.x >= a.minX && p.x <= a.maxX && p.z >= a.minZ && p.z <= a.maxZ;
  }

  /** 範囲に入ったトリガーを実行する */
  private updateTriggers(): void {
    for (const t of this.stage.triggers ?? []) {
      const inside = this.inArea(t.area);
      const entered = inside && !this.insideTriggers.has(t.id);
      if (inside) this.insideTriggers.add(t.id);
      else this.insideTriggers.delete(t.id);
      if (!entered || this.runner.busy) continue;
      if (t.once !== false && this.firedTriggers.has(t.id)) continue;
      if (!this.state.test(t.when)) {
        // 条件を満たしたら、範囲の中にいても次のフレームで発火できるように
        this.insideTriggers.delete(t.id);
        continue;
      }
      this.firedTriggers.add(t.id);
      void this.runner.start(t.actions);
      return;
    }
  }

  /** 2 点の間に壁がないか */
  private lineOfSight(from: THREE.Vector3, to: THREE.Vector3): boolean {
    const dir = to.clone().sub(from);
    const dist = dir.length();
    if (dist < 1e-3) return true;
    this.losRay.set(from, dir.normalize());
    this.losRay.far = dist;
    return this.losRay.intersectObjects(this.builder.occluders, false).length === 0;
  }

  private shake(): void {
    const app = this.renderer.domElement;
    app.classList.remove('shake');
    void app.offsetWidth;
    app.classList.add('shake');
  }

  private showClear(title = '脱出成功', text = ''): void {
    this.cleared = true;
    this.syncControls();
    const sec = Math.floor(this.state.elapsedSeconds());
    const time = `${Math.floor(sec / 60)}分${String(sec % 60).padStart(2, '0')}秒`;
    const screen = document.createElement('div');
    screen.className = 'screen';
    screen.innerHTML = `
      <div class="episode">${this.stage.episode}　${this.stage.title}</div>
      <h1>${title}</h1>
      <dl>
        <dt>調査時間</dt><dd>${time}</dd>
        <dt>記録数</dt><dd>${this.state.notes.length} / ${this.stage.notes.length}</dd>
      </dl>
      <div class="sub">${text}</div>
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
    this.lights.update(dt, this.player.pos.z);
    this.updateOpenables(dt);
    if (this.input.enabled) {
      for (const a of this.actors.values()) a.update(dt);
      this.updateTriggers();
    }
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
      o.pivot.position.set(o.basePos.x + o.slide[0] * ease, o.basePos.y + o.slide[1] * ease, o.basePos.z + o.slide[2] * ease);
    }
  }

  /** 画面中央から 2.5m 以内の、調べられる物を探す */
  private updateTarget(): void {
    this.raycaster.setFromCamera(this.center, this.camera);
    const objs = [...this.builder.occluders, ...this.builder.pickables];
    const hits = this.raycaster.intersectObjects(objs, true);
    let found: InteractableDef | null = null;
    // 最初に当たった面と（ほぼ）同じ距離の物だけを見る。壁の向こうは調べられない。
    // 見た目の箱と当たり箱がぴったり重なっている物（教卓など）は、当たり箱を優先する
    let first = -1;
    for (const h of hits) {
      if (!isShown(h.object)) continue;
      if (first < 0) first = h.distance;
      else if (h.distance - first > 0.02) break;
      const id = findInteractId(h.object);
      if (id) {
        found = this.defs.get(id) ?? null;
        break;
      }
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
