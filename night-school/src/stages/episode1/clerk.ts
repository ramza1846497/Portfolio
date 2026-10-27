import * as THREE from 'three';
import type { Actor, ActorContext, ActorDef } from '../../game/types';

/** 顔を見つめていられる秒数 */
const GAZE_LIMIT = 1.4;
/** 顔を見られたあと、次に判定するまでの猶予 */
const COOLDOWN = 3;

/**
 * コンビニの店員（のっぺらぼう）。
 * 決まり：店員の顔を見てはいけない。顔が画面の中央付近に映り続けると「目が合って」体力が減る。
 *         下を向いたままレジに近づけば、顔を見ずに会計できる。
 *
 * inStore かつ storePaid でないときだけ働く。目が合うと clerkFace スクリプトを実行する。
 */
export const clerkActor: ActorDef = {
  id: 'clerk',
  create: (ctx) => new ClerkActor(ctx),
};

class ClerkActor implements Actor {
  private root: THREE.Object3D;
  private gaze = 0;
  private cooldown = 0;
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
    if (!this.active) {
      this.gaze = 0;
      return;
    }
    if (this.cooldown > 0) {
      this.cooldown -= dt;
      this.gaze = 0;
      return;
    }
    if (this.isLookingAtFace()) this.gaze += dt;
    else this.gaze = Math.max(0, this.gaze - dt * 1.5);
    if (this.gaze >= GAZE_LIMIT) {
      this.gaze = 0;
      this.cooldown = COOLDOWN;
      this.ctx.run([{ run: 'clerkFace' }]);
    }
  }

  /** 店の中にいるだけで少し振れ、顔を見つめるほど振り切れていく */
  threat(): number {
    if (!this.active) return 0;
    return Math.min(1, 0.3 + (this.gaze / GAZE_LIMIT) * 0.7);
  }

  /** 顔が画面の中央付近にあり、遮る物がない */
  private isLookingAtFace(): boolean {
    const cam = this.ctx.camera;
    const top = new THREE.Box3().setFromObject(this.root).max.y;
    this.head.copy(this.root.position).setY(top - 0.12);
    if (this.head.distanceTo(cam.position) > 7) return false;
    this.ndc.copy(this.head).project(cam);
    if (this.ndc.z >= 1 || Math.abs(this.ndc.x) > 0.32 || Math.abs(this.ndc.y) > 0.42) return false;
    return this.ctx.lineOfSight(cam.position, this.head);
  }
}
