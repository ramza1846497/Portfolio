import * as THREE from 'three';
import { AudioEngine } from '../engine/audio';
import { CollisionWorld } from '../engine/collision';
import { Input } from '../engine/input';
import { LightRig } from '../engine/lights';
import { Player } from '../engine/player';
import { Dialogue } from '../ui/dialogue';
import { Hud } from '../ui/hud';
import { Keypad } from '../ui/keypad';
import { Tutorial } from '../ui/tutorial';
import { Combat } from './combat';
import { Notebook } from '../ui/notebook';
import { Movie } from './movie';
import { PostFX } from '../engine/post';
import { qualitySettings, type Quality } from '../engine/quality';
import { upgradeMaterials } from '../world/pbr';
import type { ModelLibrary } from '../engine/models';
import { WorldBuilder, type Openable } from '../world/builder';
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
  readonly tutorial: Tutorial;
  readonly combat: Combat;
  readonly movie: Movie;
  private post: PostFX | null = null;
  private actors = new Map<string, Actor>();
  /** 発火済みのトリガー */
  private firedTriggers = new Set<string>();
  /** いま中にいるトリガー（入り直したときだけ再発火させる） */
  private insideTriggers = new Set<string>();
  private losRay = new THREE.Raycaster();
  private tmpVec = new THREE.Vector3();
  private raycaster = new THREE.Raycaster();
  private center = new THREE.Vector2(0, 0);
  private defs = new Map<string, InteractableDef>();
  private target: InteractableDef | null = null;
  private timer = new THREE.Timer();
  private cleared = false;
  /** 怪異メーター：表示中の値と、一時的な振り切れ */
  private meter = 0;
  private meterSpike = 0;
  private debugEl: HTMLDivElement | null = null;
  private frames = 0;
  private fpsTime = 0;

  constructor(
    container: HTMLElement,
    readonly stage: StageDef,
    models: ModelLibrary | null = null,
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setClearColor(0x000000);
    this.renderer.info.autoReset = false;
    container.appendChild(this.renderer.domElement);

    this.scene.fog = new THREE.FogExp2(0x020203, 0.07);
    this.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 60);
    this.scene.add(this.camera);

    this.input = new Input(this.renderer.domElement);
    this.lights = new LightRig(this.scene, this.camera);
    this.player = new Player(this.camera, this.collision, this.input);
    this.player.onStep = () => this.audio.play('step');
    this.hud = new Hud(this.input);
    this.raycaster.far = INTERACT_DISTANCE;

    this.builder = new WorldBuilder(this.scene, this.collision, createMaterials());
    this.builder.models = models;
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
      close: (name) => {
        const o = this.builder.openables.get(name);
        if (!o) throw new Error(`unknown openable: ${name}`);
        o.opening = false;
        if (o.colliderTag) this.collision.setEnabled(o.colliderTag, true);
      },
      rattle: (names, seconds) => {
        for (const n of names) {
          const o = this.builder.openables.get(n);
          if (!o) throw new Error(`unknown openable: ${n}`);
          o.rattleLeft = seconds;
          o.rattleTimer = Math.random() * 0.15;
          o.rattleAmount = o.progress;
        }
      },
      teleport: (name) => this.teleport(name),
      look: (name) => this.lookAt(name),
      actorCommand: (id, cmd) => {
        const actor = this.actors.get(id);
        if (!actor) throw new Error(`unknown actor: ${id}`);
        actor.command?.(cmd);
      },
      shake: () => this.shake(),
      clear: (title, text) => this.showClear(title, text),
      hurt: (amount) => {
        this.audio.play('hurt');
        this.hud.hurtFlash(amount);
        this.shake();
        this.meterSpike = Math.max(this.meterSpike, 1);
      },
      meterSpike: (level) => (this.meterSpike = Math.max(this.meterSpike, level)),
      tutorial: async (name) => {
        const def = stage.tutorials?.[name];
        if (!def) throw new Error(`unknown tutorial: ${name}`);
        await this.tutorial.show(def);
      },
      hint: (text, seconds) => this.hud.hint(text, seconds),
      resetEnemies: () => this.combat.reset(),
      movie: async (name) => {
        const script = stage.movies?.[name];
        if (!script) throw new Error(`unknown movie: ${name}`);
        await this.movie.play(script);
      },
      unblock: (tag) => this.collision.setEnabled(tag, false),
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
      damage: (amount) => {
        if (!stage.maxHp || this.runner.busy) return;
        const hp = Math.max(0, this.state.getVar('hp') - amount);
        this.state.setVar('hp', hp);
        if (hp <= 0 && stage.faintScript) {
          this.hud.setDrain(0);
          void this.runner.start(stage.scripts[stage.faintScript] ?? []);
        }
      },
      setDrain: (level) => this.hud.setDrain(level),
      toast: (text) => this.hud.toast(text),
    };
    for (const a of stage.actors ?? []) this.actors.set(a.id, a.create(actorCtx));

    this.tutorial = new Tutorial(this.input.isTouch);
    this.combat = new Combat({
      state: this.state,
      stage,
      player: this.player,
      camera: this.camera,
      collision: this.collision,
      builder: this.builder,
      audio: this.audio,
      hud: this.hud,
      damage: (amount) => this.damageWithFx(amount),
      run: (actions) => void this.runner.start(actions),
      shake: () => this.shake(),
    });
    this.combat.moveInput = () => this.input.move;
    this.movie = new Movie({
      camera: this.camera,
      player: this.player,
      combat: this.combat,
      audio: this.audio,
      isTouch: this.input.isTouch,
    });
    this.notebook.onClose = () => this.syncControls();
    this.notebook.onUse = (id) => {
      const use = this.stage.items.find((x) => x.id === id)?.use;
      if (!use || this.runner.busy) return;
      this.notebook.close();
      void this.runner.start(use);
    };
    this.state.subscribe(() => this.syncState());
    if (stage.maxHp) this.state.setVar('hp', stage.maxHp);
    this.hud.showVitals(stage.maxHp !== undefined);
    this.syncState();

    const s = this.builder.spawns.get('start') ?? stage.start;
    this.player.place(s.x, s.z, s.yaw);
    this.updateFloor();

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

  start(quality: Quality): void {
    this.applyQuality(quality);
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
    if (this.movie.active) {
      if (a === 'interact' || a === 'confirm' || a === 'advance' || a === 'cancel' || a === 'attack') this.movie.skip();
      return;
    }
    if (this.notebook.isOpen) {
      const same = (a === 'notebook' && this.notebook.currentTab === 'notes') || (a === 'items' && this.notebook.currentTab === 'items');
      if (a === 'cancel' || same) this.notebook.close();
      else if (a === 'notebook' || a === 'items') this.notebook.open(a === 'items' ? 'items' : 'notes');
      return;
    }
    if (this.keypad.active) return;
    if (this.tutorial.active) {
      if (a === 'confirm' || a === 'interact') this.tutorial.confirm();
      return;
    }
    if (this.dialogue.active) {
      if (a === 'interact') this.dialogue.key('advance');
      else if (a === 'advance' || a === 'up' || a === 'down' || a === 'confirm') this.dialogue.key(a);
      return;
    }
    if (this.runner.busy) return;
    if (a === 'attack' && this.input.enabled) {
      this.combat.attack();
      return;
    }
    if (a === 'dodge' && this.input.enabled) {
      this.combat.dodge();
      return;
    }
    if (a === 'interact' && this.target) {
      void this.runner.interact(this.target);
    } else if (a === 'notebook' || a === 'items') {
      this.notebook.open(a === 'items' ? 'items' : 'notes');
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
    this.hud.setUsableCount(this.notebook.usableCount);
    // （コンストラクタの途中で呼ばれたときは combat がまだない）
    if (this.combat) this.hud.setCombat(this.combat.armed);
    if (this.stage.maxHp) this.hud.setHp(this.state.getVar('hp') / this.stage.maxHp);
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

  /** いる階を変数 floor に入れる（スクリプトの条件で使う） */
  private updateFloor(): void {
    const f = this.stage.floorOf?.(this.player.pos.x, this.player.pos.z);
    if (f !== undefined && f !== this.state.getVar('floor')) this.state.setVar('floor', f);
  }

  /** 怪異メーター：気配・追ってくる怪異・一時的な振り切れのうち最大のもの */
  private updateMeter(dt: number): void {
    const p = this.player.pos;
    let target = 0;
    for (const pr of this.stage.presences ?? []) {
      const d = Math.hypot(pr.x - p.x, pr.z - p.z);
      if (d >= pr.radius || !this.state.test(pr.when)) continue;
      target = Math.max(target, pr.strength * (1 - d / pr.radius));
    }
    for (const a of this.actors.values()) target = Math.max(target, a.threat?.() ?? 0);
    target = Math.max(target, this.combat.threat());
    this.meterSpike = Math.max(0, this.meterSpike - dt * 0.35);
    target = Math.max(target, this.meterSpike);
    // 針は少し遅れて追いかけ、強いほど震える
    this.meter += (target - this.meter) * Math.min(1, dt * 4);
    const jitter = (Math.random() - 0.5) * this.meter * 0.12;
    const shown = Math.max(0, Math.min(1, this.meter + jitter));
    this.hud.drawMeter(shown);
    this.audio.setStatic(shown);
  }

  /** 戦闘で体力が減る：赤い明滅・揺れ・0 なら気絶 */
  private damageWithFx(amount: number): void {
    if (!this.stage.maxHp || this.runner.busy) return;
    const hp = Math.max(0, this.state.getVar('hp') - amount);
    this.state.setVar('hp', hp);
    this.audio.play('hurt');
    this.hud.hurtFlash(amount / this.stage.maxHp);
    this.shake();
    this.meterSpike = Math.max(this.meterSpike, 0.8);
    if (hp <= 0 && this.stage.faintScript) void this.runner.start(this.stage.scripts[this.stage.faintScript] ?? []);
  }

  private teleport(name: string): void {
    const s = this.builder.spawns.get(name);
    if (!s) throw new Error(`unknown spawn: ${name}`);
    this.player.place(s.x, s.z, s.yaw);
    this.updateFloor();
    // 移った先のトリガーがすぐ発火しないように、いる場所を「中にいる」扱いにする
    this.insideTriggers.clear();
    // （条件をまだ満たしていないトリガーは、満たした時点で発火できるよう印を付けない）
    for (const t of this.stage.triggers ?? []) if (this.inArea(t.area) && this.state.test(t.when)) this.insideTriggers.add(t.id);
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
      if (!entered) continue;
      if (this.runner.busy) {
        // 会話が終わってから、もう一度確かめる
        this.insideTriggers.delete(t.id);
        continue;
      }
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
        ${this.state.getVar('faints') > 0 ? `<dt>気絶</dt><dd>${this.state.getVar('faints')} 回</dd>` : ''}
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
    this.post?.resize();
  }

  /** 画質：解像度・懐中電灯の影・後処理 */
  private applyQuality(quality: Quality): void {
    const q = qualitySettings(quality);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, q.pixelRatio));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    upgradeMaterials(this.scene, this.builder.materials, quality === 'low', this.renderer.capabilities.getMaxAnisotropy() >= 4 ? 4 : 1);
    const shadows = q.shadowSize > 0;
    this.renderer.shadowMap.enabled = shadows;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    const spot = this.lights.flashlight;
    spot.castShadow = shadows;
    spot.shadow.mapSize.set(q.shadowSize || 1, q.shadowSize || 1);
    spot.shadow.bias = -0.0006;
    spot.shadow.normalBias = 0.03;
    spot.shadow.camera.near = 0.2;
    // 影は近くだけ（遠くの物まで影を描くと重い）
    spot.shadow.camera.far = 12;
    this.scene.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      // 光らない物だけ影を落とす・受ける（半透明の物は落とすだけ）
      const lit = mats.every((m) => !(m instanceof THREE.MeshBasicMaterial));
      // 手に持った竹刀は、懐中電灯のすぐ前にあるので影を落とさない
      // ステージの物だけ（照明器具などは落とさない）
      let held = false;
      let inStage = false;
      for (let p = o.parent; p; p = p.parent) {
        if (p === this.camera) held = true;
        if (p === this.builder.root) inStage = true;
      }
      // 壁・床は影を落とさない（懐中電灯は目の位置なので、壁の影はほとんど見えず、描く量だけ倍になる）
      o.castShadow = shadows && lit && inStage && !held && !o.userData.static;
      o.receiveShadow = shadows && lit && mats.every((m) => !m.transparent);
      for (const m of mats) m.needsUpdate = true;
    });
    this.post = new PostFX(this.renderer, q);
  }

  private frame(time: number): void {
    this.timer.update(time);
    const dt = Math.min(this.timer.getDelta(), 0.05);
    this.input.update();
    this.player.update(dt);
    // 歩いて移れる区域（1 階 ⇔ 渡り廊下・体育館）もあるので毎フレーム見る
    this.updateFloor();
    this.lights.update(dt, this.player.pos.x, this.player.pos.z);
    if (!this.cleared) this.updateMeter(dt);
    this.updateOpenables(dt);
    for (const anim of this.builder.animations) anim(time / 1000);
    this.combat.update(dt, !this.input.enabled);
    // 登場演出の間は、視線を演出が動かす
    if (this.movie.active) this.movie.update(dt);
    if (this.input.enabled) {
      for (const a of this.actors.values()) a.update(dt);
      this.updateTriggers();
    } else {
      this.hud.setDrain(0);
    }
    if (this.input.enabled) this.updateTarget();
    else if (this.target) {
      this.target = null;
      this.hud.setTarget(null);
    }
    // 後処理は何回にも分けて描くので、描画回数は 1 フレーム分まとめて数える
    this.renderer.info.reset();
    if (this.post) this.post.render(this.scene, this.camera, time);
    else this.renderer.render(this.scene, this.camera);
    this.updateDebug(dt);
  }

  private updateOpenables(dt: number): void {
    for (const o of this.builder.openables.values()) {
      if (o.rattleLeft > 0) {
        this.updateRattle(o, dt);
        continue;
      }
      const goal = o.opening ? 1 : 0;
      if (o.progress === goal) continue;
      const step = dt / (o.seconds ?? OPEN_SECONDS);
      o.progress = o.opening ? Math.min(1, o.progress + step) : Math.max(0, o.progress - step);
      // ゆっくり動き出して、最後にすっと止まる
      const t = o.progress;
      const ease = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      o.pivot.rotation.y = o.openRotY * ease;
      o.pivot.position.set(o.basePos.x + o.slide[0] * ease, o.basePos.y + o.slide[1] * ease, o.basePos.z + o.slide[2] * ease);
    }
  }

  /** 扉が勝手にバタンバタンと開け閉めする */
  private updateRattle(o: Openable, dt: number): void {
    o.rattleLeft -= dt;
    o.rattleTimer -= dt;
    const done = o.rattleLeft <= 0;
    const rest = o.opening ? 1 : 0;
    if (done) {
      o.rattleTarget = rest;
    } else if (o.rattleTimer <= 0) {
      // 開く → 叩きつけるように閉まる、を不規則に繰り返す
      const closing = o.rattleTarget > 0.3;
      o.rattleTarget = closing ? 0 : 0.35 + Math.random() * 0.55;
      o.rattleTimer = closing ? 0.12 + Math.random() * 0.25 : 0.1 + Math.random() * 0.18;
    }
    const prev = o.rattleAmount;
    o.rattleAmount += (o.rattleTarget - o.rattleAmount) * Math.min(1, dt * 22);
    if (prev > 0.08 && o.rattleAmount <= 0.08 && o.rattleTarget === 0) {
      const p = o.pivot.getWorldPosition(this.tmpVec);
      const d = p.distanceTo(this.camera.position);
      this.audio.play('bang', { gain: Math.max(0.15, 1 - d / 14), pan: this.panOf(p) });
    }
    const t = done ? rest : o.rattleAmount;
    o.pivot.rotation.y = o.openRotY * t;
    o.pivot.position.set(o.basePos.x + o.slide[0] * t, o.basePos.y + o.slide[1] * t, o.basePos.z + o.slide[2] * t);
    if (done) o.rattleLeft = 0;
  }

  /** 音の左右（カメラから見て右が +） */
  private panOf(p: THREE.Vector3): number {
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
    const dx = p.x - this.camera.position.x;
    const dz = p.z - this.camera.position.z;
    const len = Math.hypot(dx, dz) || 1;
    return (dx * right.x + dz * right.z) / len;
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
