import * as THREE from 'three';
import type { Actor, ActorContext, ActorDef } from '../../game/types';

/** この距離より近くで顔が画面に映ると、体力が減り始める（m） */
const RANGE = 4.5;
/** 体力の減り方（1 秒あたり、いちばん近いとき） */
const DRAIN_PER_SEC = 9;

/**
 * コンビニの店員（のっぺらぼう）。
 * 決まり：店員の顔を見てはいけない。近くで顔が画面に映っている間、体力がじわじわ減る
 *         （近いほど速い）。会話や演出は挟まない。初めて減ったときだけ知らせを出す。
 *
 * inStore かつ storePaid でないときだけ働く。
 */
export const clerkActor: ActorDef = {
  id: 'clerk',
  create: (ctx) => new ClerkActor(ctx),
};

class ClerkActor implements Actor {
  private root: THREE.Object3D;
  /** 0..1：いま顔がどれだけ「効いている」か（近さ） */
  private exposure = 0;
  private pending = 0;
  private beat = 0;
  private head = new THREE.Vector3();
  private ndc = new THREE.Vector3();

  constructor(private ctx: ActorContext) {
    const root = ctx.builder.named.get('clerk');
    if (!root) throw new Error('clerk: object "clerk" not found');
    this.root = root;
  }

  private get active(): boolean {
    const s = this.ctx.state;
    return s.hasFlag('inStore') && !s.hasFlag('storePaid');
  }

  update(dt: number): void {
    const target = this.active ? this.faceExposure() : 0;
    // 見るのをやめると、赤みはすぐに引いていく
    this.exposure += (target - this.exposure) * Math.min(1, dt * (target > this.exposure ? 6 : 3));
    this.ctx.setDrain(this.exposure);
    if (target <= 0) return;

    if (!this.ctx.state.hasNote('n_noppera')) {
      this.ctx.state.addNote('n_noppera');
      this.ctx.toast('……顔が、ない。見ちゃいけない');
      this.ctx.audio.play('stinger', { gain: 0.6 });
    }
    // 1 ずつまとめて減らす
    this.pending += DRAIN_PER_SEC * target * dt;
    if (this.pending >= 1) {
      const n = Math.floor(this.pending);
      this.pending -= n;
      this.ctx.damage(n);
    }
    this.beat -= dt;
    if (this.beat <= 0) {
      this.beat = 0.7 - target * 0.35;
      this.ctx.audio.play('heartbeat', { gain: 0.4 + target * 0.6 });
    }
  }

  /** 店の中にいるだけで少し振れ、顔が近くに映るほど振り切れていく */
  threat(): number {
    if (!this.active) return 0;
    return Math.min(1, 0.3 + this.exposure * 0.7);
  }

  /** 顔が RANGE 以内で画面に映っていて、遮る物がなければ、近さに応じて 0..1 */
  private faceExposure(): number {
    const cam = this.ctx.camera;
    const top = new THREE.Box3().setFromObject(this.root).max.y;
    this.head.copy(this.root.position).setY(top - 0.12);
    const d = this.head.distanceTo(cam.position);
    if (d > RANGE) return 0;
    this.ndc.copy(this.head).project(cam);
    if (this.ndc.z >= 1 || Math.abs(this.ndc.x) > 1 || Math.abs(this.ndc.y) > 1) return 0;
    if (!this.ctx.lineOfSight(cam.position, this.head)) return 0;
    return 0.35 + 0.65 * (1 - d / RANGE);
  }
}
