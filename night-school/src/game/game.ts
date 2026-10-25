import * as THREE from 'three';
import { AudioEngine } from '../engine/audio';
import { CollisionWorld } from '../engine/collision';
import { Input } from '../engine/input';
import { LightRig } from '../engine/lights';
import { Player } from '../engine/player';
import { Hud } from '../ui/hud';
import { WorldBuilder } from '../world/builder';
import { createMaterials } from '../world/materials';
import type { InteractableDef, StageDef } from './types';

const INTERACT_DISTANCE = 2.5;

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
  private raycaster = new THREE.Raycaster();
  private center = new THREE.Vector2(0, 0);
  private defs = new Map<string, InteractableDef>();
  private target: InteractableDef | null = null;
  private timer = new THREE.Timer();
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

    const s = stage.start;
    this.player.place(s.x, s.z, s.yaw);
    this.hud.setObjective(stage.objectives[0]?.text ?? '');

    window.addEventListener('resize', () => this.resize());
    this.input.onAction((a) => {
      if (a === 'interact' && this.target) this.hud.toast(`${this.target.name}（調べる処理は次の段階で実装）`);
    });

    if (new URLSearchParams(location.search).has('debug')) {
      this.debugEl = document.createElement('div');
      this.debugEl.className = 'debug';
      document.body.appendChild(this.debugEl);
    }
  }

  start(): void {
    this.audio.unlock();
    this.renderer.setAnimationLoop((time) => this.frame(time));
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
    this.updateTarget();
    this.renderer.render(this.scene, this.camera);
    this.updateDebug(dt);
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
      this.hud.setTarget(found ? found.name : null);
    }
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
