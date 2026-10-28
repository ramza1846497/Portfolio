import * as THREE from 'three';
import type { CollisionWorld } from './collision';
import type { Input } from './input';

const EYE = 1.5;
const RADIUS = 0.28;
const SPEED = 2.3;

/** 一人称プレイヤー：視点・移動・当たり判定・足音のタイミング */
export class Player {
  readonly pos = new THREE.Vector3();
  yaw = 0;
  pitch = 0;
  private bob = 0;
  private stepDist = 0;
  /** 1 歩ごとに呼ばれる */
  onStep: (() => void) | null = null;
  private lookSens: number;

  constructor(
    readonly camera: THREE.PerspectiveCamera,
    private collision: CollisionWorld,
    private input: Input,
  ) {
    this.lookSens = input.isTouch ? 0.0052 : 0.0035;
    camera.rotation.order = 'YXZ';
  }

  /** 当たり判定つきで押し動かす（回避の踏み込み・ノックバック） */
  push(dx: number, dz: number): void {
    const p = { x: this.pos.x, z: this.pos.z };
    this.collision.move(p, dx, dz, RADIUS);
    this.pos.x = p.x;
    this.pos.z = p.z;
  }

  place(x: number, z: number, yaw: number): void {
    this.pos.set(x, 0, z);
    this.yaw = yaw;
    this.pitch = 0;
    this.sync();
  }

  update(dt: number): void {
    const look = this.input.consumeLook();
    this.yaw -= look.x * this.lookSens;
    this.pitch -= look.y * this.lookSens;
    this.pitch = Math.max(-1.35, Math.min(1.35, this.pitch));

    const mv = this.input.move;
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    // 前 = -Z（yaw=0 のとき）
    const dx = (mv.x * cos - mv.y * sin) * SPEED * dt;
    const dz = (-mv.x * sin - mv.y * cos) * SPEED * dt;
    const before = { x: this.pos.x, z: this.pos.z };
    const p = { x: this.pos.x, z: this.pos.z };
    this.collision.move(p, dx, dz, RADIUS);
    this.pos.x = p.x;
    this.pos.z = p.z;

    const moved = Math.hypot(p.x - before.x, p.z - before.z);
    if (moved > 1e-4) {
      this.bob += moved * 5.2;
      this.stepDist += moved;
      if (this.stepDist > 0.72) {
        this.stepDist = 0;
        this.onStep?.();
      }
    } else {
      // 止まったら揺れを戻す
      this.bob += (Math.round(this.bob / Math.PI) * Math.PI - this.bob) * Math.min(1, dt * 6);
    }
    this.sync();
  }

  private sync(): void {
    this.camera.position.set(this.pos.x, EYE + Math.abs(Math.sin(this.bob)) * 0.035, this.pos.z);
    this.camera.rotation.set(this.pitch, this.yaw, Math.sin(this.bob) * 0.004);
  }
}
