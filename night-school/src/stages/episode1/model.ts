import * as THREE from 'three';
import type { Box2 } from '../../engine/collision';
import type { Actor, ActorContext, ActorDef } from '../../game/types';
import { NAV_1F, OZ } from './floor1';

const SPEED = 1.6;
const RADIUS = 0.25;
const CATCH_DISTANCE = 0.95;
/** 動き出す前の猶予（秒） */
const GRACE = 2.5;

/**
 * 動く人体模型。
 * 決まり：見られている間は動けない。目を離すと、心臓を持つプレイヤーへ近づいてくる。
 *
 * 状態はフラグで決まる（データ側で切り替える）
 *   modelHunting かつ modelCalm でない → 追ってくる
 * 命令
 *   reset … 理科室の定位置に戻す
 */
export const modelActor: ActorDef = {
  id: 'model',
  create: (ctx) => new AnatomyModelActor(ctx),
};

class AnatomyModelActor implements Actor {
  private root: THREE.Object3D;
  private home: THREE.Vector3;
  private homeRot: number;
  private body: Box2;
  private grace = GRACE;
  private stepDist = 0;
  private beatTimer = 0;
  private tmp = new THREE.Vector3();
  private chest = new THREE.Vector3();

  constructor(private ctx: ActorContext) {
    const root = ctx.builder.named.get('model');
    if (!root) throw new Error('model: object "model" not found');
    this.root = root;
    this.home = root.position.clone();
    this.homeRot = root.rotation.y;
    this.body = ctx.collision.add(0, 0, 0, 0, 'modelBody');
    this.syncBody();
  }

  command(cmd: string): void {
    if (cmd === 'reset') {
      this.root.position.copy(this.home);
      this.root.rotation.set(0, this.homeRot, 0);
      this.grace = GRACE;
      this.syncBody();
    }
  }

  update(dt: number): void {
    const { state, playerPos: p } = this.ctx;
    if (!state.hasFlag('modelHunting') || state.hasFlag('modelCalm')) return;
    // プレイヤーが 1 階にいないときは止まる
    if (Math.abs(p.z - OZ) > 20) return;

    const m = this.root.position;
    const dist = Math.hypot(p.x - m.x, p.z - m.z);
    this.heartbeat(dt, dist);

    if (this.grace > 0) {
      this.grace -= dt;
      return;
    }
    if (this.isSeen(dist)) {
      this.root.rotation.z = 0;
      return;
    }
    if (dist < CATCH_DISTANCE) {
      this.ctx.run([{ run: 'modelCaught' }]);
      return;
    }

    const target = this.nextTarget();
    const dx = target.x - m.x;
    const dz = target.z - m.z;
    const len = Math.hypot(dx, dz);
    if (len < 1e-3) return;
    const step = Math.min(len, SPEED * dt);
    const pos = { x: m.x, z: m.z };
    this.body.enabled = false;
    this.ctx.collision.move(pos, (dx / len) * step, (dz / len) * step, RADIUS);
    this.body.enabled = true;
    const moved = Math.hypot(pos.x - m.x, pos.z - m.z);
    m.x = pos.x;
    m.z = pos.z;
    this.root.rotation.y = Math.atan2(dx, dz);
    // ぎこちなく揺れる
    this.root.rotation.z = Math.sin(performance.now() * 0.02) * 0.04;
    this.syncBody();

    this.stepDist += moved;
    if (this.stepDist > 0.6) {
      this.stepDist = 0;
      this.ctx.audio.play('thud', { gain: Math.max(0, 1 - dist / 18), pan: this.panOf(m) });
    }
  }

  /** カメラの視界に入っていて、壁に遮られていなければ「見られている」 */
  private isSeen(dist: number): boolean {
    if (dist > 25) return false;
    const cam = this.ctx.camera;
    this.chest.copy(this.root.position).setY(1.2);
    this.tmp.copy(this.chest).project(cam);
    const inView = this.tmp.z < 1 && Math.abs(this.tmp.x) < 1.05 && Math.abs(this.tmp.y) < 1.1;
    if (!inView) return false;
    // 頭か胸のどちらかが見えていればよい
    if (this.ctx.lineOfSight(cam.position, this.chest)) return true;
    this.chest.setY(1.65);
    return this.ctx.lineOfSight(cam.position, this.chest);
  }

  /** 次に向かう地点：見通しがよければプレイヤーへ直接、だめなら経路の次の点 */
  private nextTarget(): { x: number; z: number } {
    const m = this.root.position;
    const p = this.ctx.playerPos;
    this.body.enabled = false;
    try {
      if (!this.blocked(m.x, m.z, p.x, p.z)) return p;
      const from = this.nearestNode(m.x, m.z);
      const to = this.nearestNode(p.x, p.z);
      if (from < 0 || to < 0) return p;
      const path = bfs(from, to);
      if (!path) return p;
      // 経路上で、いまの位置から直接行ける一番先の点へ
      for (let i = path.length - 1; i >= 0; i--) {
        const [x, z] = NAV_1F.nodes[path[i]];
        if (!this.blocked(m.x, m.z, x, z)) return { x, z };
      }
      const [x, z] = NAV_1F.nodes[from];
      return { x, z };
    } finally {
      this.body.enabled = true;
    }
  }

  private blocked(ax: number, az: number, bx: number, bz: number): boolean {
    return this.ctx.collision.segmentBlocked(ax, az, bx, bz, RADIUS * 0.8);
  }

  private nearestNode(x: number, z: number): number {
    let best = -1;
    let bestD = Infinity;
    NAV_1F.nodes.forEach(([nx, nz], i) => {
      const d = Math.hypot(nx - x, nz - z);
      if (d < bestD && !this.blocked(x, z, nx, nz)) {
        best = i;
        bestD = d;
      }
    });
    return best;
  }

  private heartbeat(dt: number, dist: number): void {
    if (dist > 9) return;
    this.beatTimer -= dt;
    if (this.beatTimer <= 0) {
      this.beatTimer = 0.45 + dist * 0.12;
      this.ctx.audio.play('heartbeat', { gain: 1 - dist / 9 });
    }
  }

  /** 音の左右（カメラから見て右が +） */
  private panOf(pos: THREE.Vector3): number {
    const cam = this.ctx.camera;
    const right = this.tmp.set(1, 0, 0).applyQuaternion(cam.quaternion);
    const dx = pos.x - cam.position.x;
    const dz = pos.z - cam.position.z;
    const len = Math.hypot(dx, dz) || 1;
    return (dx * right.x + dz * right.z) / len;
  }

  private syncBody(): void {
    const m = this.root.position;
    this.body.minX = m.x - RADIUS;
    this.body.maxX = m.x + RADIUS;
    this.body.minZ = m.z - RADIUS;
    this.body.maxZ = m.z + RADIUS;
  }
}

/** 経路グラフの幅優先探索。見つからなければ null */
function bfs(from: number, to: number): number[] | null {
  const prev = new Map<number, number>([[from, -1]]);
  const queue = [from];
  while (queue.length) {
    const n = queue.shift()!;
    if (n === to) break;
    for (const [a, c] of NAV_1F.edges) {
      const next = a === n ? c : c === n ? a : -1;
      if (next >= 0 && !prev.has(next)) {
        prev.set(next, n);
        queue.push(next);
      }
    }
  }
  if (!prev.has(to)) return null;
  const path: number[] = [];
  for (let n = to; n !== -1; n = prev.get(n)!) path.unshift(n);
  return path;
}
