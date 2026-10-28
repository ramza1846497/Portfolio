import * as THREE from 'three';
import type { AudioEngine } from '../engine/audio';
import type { Box2, CollisionWorld } from '../engine/collision';
import type { Player } from '../engine/player';
import type { Hud } from '../ui/hud';
import type { WorldBuilder } from '../world/builder';
import type { GameState } from './state';
import type { Action, CombatHintKey, EnemyDef, StageDef } from './types';

/** 竹刀が届く距離（m）と、正面からの角度（ラジアン） */
const REACH = 2.3;
const ARC = 0.95;
const ATTACK_COOLDOWN = 0.45;
const DODGE_TIME = 0.22;
const DODGE_SPEED = 10;
const DODGE_COOLDOWN = 0.9;
/** 回避中・被弾直後の無敵時間 */
const IFRAME_DODGE = 0.35;
const IFRAME_HURT = 0.9;

type EnemyState = 'idle' | 'chase' | 'windup' | 'lunge' | 'charge' | 'slam' | 'recover' | 'backoff' | 'stun' | 'hurt' | 'dying' | 'dead';

interface Enemy {
  def: EnemyDef;
  root: THREE.Object3D;
  home: THREE.Vector3;
  homeRot: number;
  body: Box2;
  hp: number;
  state: EnemyState;
  timer: number;
  /** 突進・飛びかかりの向き */
  dir: THREE.Vector2;
  cooldown: number;
  halfDone: boolean;
  /** 赤く光る・白く光るための材質一覧 */
  mats: THREE.MeshLambertMaterial[];
  flash: number;
  knock: THREE.Vector2;
  /** 攻撃の予兆：頭の上に出る「！」 */
  mark: THREE.Sprite;
}

/** ムービーで見せる敵の様子 */
export type DemoPose = 'none' | 'windup' | 'stun' | 'rage';

export interface CombatHost {
  state: GameState;
  stage: StageDef;
  player: Player;
  camera: THREE.PerspectiveCamera;
  collision: CollisionWorld;
  builder: WorldBuilder;
  audio: AudioEngine;
  hud: Hud;
  /** 体力を減らす（0 になれば気絶） */
  damage(amount: number): void;
  /** スクリプトを実行（倒したとき・体力が半分を切ったとき） */
  run(actions: Action[]): void;
  shake(): void;
}

/**
 * 戦闘：プレイヤーの攻撃（竹刀）と回避、敵の動き。
 * 敵の種類ごとの動きはここに書き、数値と出来事は StageDef.enemies のデータで決める。
 */
export class Combat {
  private enemies: Enemy[] = [];
  private attackCd = 0;
  private swing = 0;
  private hitPending = false;
  private dodgeT = 0;
  private dodgeCd = 0;
  private dodgeDir = new THREE.Vector2();
  private iframe = 0;
  private shownHints = new Set<CombatHintKey>();
  private weapon: THREE.Group;
  /** ムービー中の見た目（敵 id → 様子） */
  private demo = new Map<string, { pose: DemoPose; flash: number }>();

  constructor(private host: CombatHost) {
    for (const def of host.stage.enemies ?? []) {
      const root = host.builder.named.get(def.id);
      if (!root) throw new Error(`enemy object not found: ${def.id}`);
      // 向き（y）のあとに前後の傾き（x）・ふらつき（z）をかける
      root.rotation.order = 'YXZ';
      const mats: THREE.MeshLambertMaterial[] = [];
      root.traverse((o) => {
        if (o instanceof THREE.Mesh && o.material instanceof THREE.MeshLambertMaterial) {
          // 光らせる演出のため、敵ごとに材質を複製する
          o.material = o.material.clone();
          mats.push(o.material);
        }
      });
      // 「！」は頭の少し上に
      const top = new THREE.Box3().setFromObject(root).max.y - root.position.y;
      const mark = new THREE.Sprite(new THREE.SpriteMaterial({ map: markTexture(), depthTest: false, transparent: true }));
      mark.position.set(0, top + 0.35, 0);
      mark.scale.setScalar(0.42);
      mark.renderOrder = 10;
      mark.visible = false;
      root.add(mark);
      const e: Enemy = {
        mark,
        def,
        root,
        home: root.position.clone(),
        homeRot: root.rotation.y,
        body: host.collision.add(0, 0, 0, 0, `enemy:${def.id}`),
        hp: def.hp,
        state: 'idle',
        timer: 0,
        dir: new THREE.Vector2(),
        cooldown: 1,
        halfDone: false,
        mats,
        flash: 0,
        knock: new THREE.Vector2(),
      };
      this.syncBody(e);
      this.enemies.push(e);
    }
    this.weapon = this.makeWeapon();
    host.camera.add(this.weapon);
  }

  get armed(): boolean {
    const w = this.host.stage.weaponItem;
    return !!w && this.host.state.hasItem(w);
  }

  /** 戦っている（近くで動いている）敵がいるか */
  get inCombat(): boolean {
    return this.enemies.some((e) => this.isActive(e) && e.state !== 'idle' && this.dist(e) < 14);
  }

  /** 怪異メーターへの寄与 */
  threat(): number {
    let t = 0;
    for (const e of this.enemies) {
      if (!this.isActive(e)) continue;
      t = Math.max(t, Math.max(0, 1 - this.dist(e) / 12) * (e.state === 'windup' || e.state === 'charge' ? 1 : 0.85));
    }
    return t;
  }

  attack(): void {
    if (!this.armed || this.attackCd > 0) return;
    this.attackCd = ATTACK_COOLDOWN;
    this.swing = 0.0001;
    this.hitPending = true;
    this.host.audio.play('swing');
  }

  dodge(): void {
    if (!this.armed || this.dodgeCd > 0) return;
    const yaw = this.host.player.yaw;
    // 移動入力の向き（なければ後ろ）へ踏み込む
    const input = this.moveInput();
    const fx = -Math.sin(yaw);
    const fz = -Math.cos(yaw);
    const rx = Math.cos(yaw);
    const rz = -Math.sin(yaw);
    let dx = rx * input.x + fx * input.y;
    let dz = rz * input.x + fz * input.y;
    if (Math.hypot(dx, dz) < 0.1) {
      dx = -fx;
      dz = -fz;
    }
    const len = Math.hypot(dx, dz);
    this.dodgeDir.set(dx / len, dz / len);
    this.dodgeT = DODGE_TIME;
    this.dodgeCd = DODGE_COOLDOWN;
    this.iframe = Math.max(this.iframe, IFRAME_DODGE);
    this.host.audio.play('dodge');
  }

  /** 移動入力（Game から毎フレーム渡す） */
  moveInput: () => { x: number; y: number } = () => ({ x: 0, y: 0 });

  /** 気絶したときなど：敵を元の場所・満タンに戻す（倒した敵はそのまま） */
  reset(): void {
    for (const e of this.enemies) {
      if (e.state === 'dead' || e.state === 'dying') continue;
      e.root.position.copy(e.home);
      e.root.rotation.set(0, e.homeRot, 0);
      e.root.scale.setScalar(1);
      e.hp = e.def.hp;
      e.state = 'idle';
      e.cooldown = 1.5;
      e.halfDone = false;
      this.syncBody(e);
    }
  }

  update(dt: number, paused: boolean): void {
    this.attackCd = Math.max(0, this.attackCd - dt);
    this.dodgeCd = Math.max(0, this.dodgeCd - dt);
    this.iframe = Math.max(0, this.iframe - dt);
    this.updateWeapon(dt, paused);
    this.updateBossBar();
    if (paused) return;

    if (this.dodgeT > 0) {
      this.dodgeT -= dt;
      this.host.player.push(this.dodgeDir.x * DODGE_SPEED * dt, this.dodgeDir.y * DODGE_SPEED * dt);
    }
    if (this.hitPending && this.swing > 0.35) {
      this.hitPending = false;
      this.resolveHits();
    }
    for (const e of this.enemies) this.updateEnemy(e, dt);
  }

  // ---------------- プレイヤーの攻撃 ----------------

  private resolveHits(): void {
    const p = this.host.player.pos;
    const yaw = this.host.player.yaw;
    const fx = -Math.sin(yaw);
    const fz = -Math.cos(yaw);
    let hitAny = false;
    for (const e of this.enemies) {
      if (!this.isActive(e) || e.state === 'dying' || e.state === 'dead') continue;
      const dx = e.root.position.x - p.x;
      const dz = e.root.position.z - p.z;
      const d = Math.hypot(dx, dz);
      const reach = REACH + (e.def.kind === 'ninomiya' ? 0.5 : 0);
      if (d > reach) continue;
      const cos = (dx * fx + dz * fz) / Math.max(d, 1e-3);
      if (d > 0.6 && Math.acos(Math.min(1, cos)) > ARC) continue;
      hitAny = true;
      this.hitEnemy(e, dx / Math.max(d, 1e-3), dz / Math.max(d, 1e-3));
    }
    if (hitAny) this.host.audio.play('hit');
  }

  private hitEnemy(e: Enemy, nx: number, nz: number): void {
    // ボスは突進中は弾く（気絶中は倍のダメージ）
    if (e.def.kind === 'ninomiya' && e.state === 'charge') {
      this.host.audio.play('clank');
      return;
    }
    // 石の体：ふだんは浅くしか効かない。気絶中が本当の狙い目
    const dmg = e.def.kind === 'ninomiya' ? (e.state === 'stun' ? 2 : 0.5) : 1;
    e.hp -= dmg;
    e.flash = 0.18;
    this.hint('hit');
    if (e.def.kind === 'shadow') {
      // 身構え・飛びかかりの最中はひるまない（叩き続けるだけでは勝てない）
      if (e.state !== 'windup' && e.state !== 'lunge') {
        e.knock.set(nx * 3.5, nz * 3.5);
        e.state = 'hurt';
        e.timer = 0.3;
      }
    } else if (e.state !== 'stun') {
      e.knock.set(nx * 1.2, nz * 1.2);
    }
    if (!e.halfDone && e.hp <= e.def.hp / 2 && e.hp > 0 && e.def.onHalf) {
      e.halfDone = true;
      this.host.run(e.def.onHalf);
    }
    if (e.hp <= 0) {
      e.state = 'dying';
      e.timer = 0.7;
      e.body.enabled = false;
      this.host.audio.play('vanish');
    }
  }

  // ---------------- 敵 ----------------

  private isActive(e: Enemy): boolean {
    if (e.state === 'dead') return false;
    return this.host.state.test(e.def.activeWhen) && this.visible(e.root);
  }

  private visible(o: THREE.Object3D | null): boolean {
    while (o) {
      if (!o.visible) return false;
      o = o.parent;
    }
    return true;
  }

  private dist(e: Enemy): number {
    const p = this.host.player.pos;
    return Math.hypot(e.root.position.x - p.x, e.root.position.z - p.z);
  }

  private updateEnemy(e: Enemy, dt: number): void {
    if (e.state === 'dead') return;
    if (e.state === 'dying') {
      e.timer -= dt;
      const k = Math.max(0, e.timer / 0.7);
      e.root.scale.set(1 + (1 - k) * 0.4, k, 1 + (1 - k) * 0.4);
      this.setGlow(e, 0xffffff, 1 - k);
      if (e.timer <= 0) {
        e.state = 'dead';
        e.root.visible = false;
        this.host.run(e.def.onDefeat);
      }
      return;
    }
    if (!this.isActive(e)) return;

    e.flash = Math.max(0, e.flash - dt);
    e.cooldown = Math.max(0, e.cooldown - dt);
    // ノックバック
    if (e.knock.lengthSq() > 0.001) {
      this.moveEnemy(e, e.knock.x * dt, e.knock.y * dt);
      e.knock.multiplyScalar(Math.max(0, 1 - dt * 8));
    }
    if (e.def.kind === 'shadow') this.shadowAI(e, dt);
    else this.ninomiyaAI(e, dt);

    // 予兆の「！」
    e.mark.visible = e.state === 'windup';
    if (e.mark.visible) e.mark.scale.setScalar(0.42 + Math.max(0, e.timer) * 0.25);
    // 光り方：被弾は白、身構えは赤く脈打つ
    if (e.flash > 0) this.setGlow(e, 0xffffff, 0.9);
    else if (e.state === 'windup' || (e.state === 'charge' && e.timer > 0)) this.setGlow(e, 0xff2010, 0.5 + 0.5 * Math.sin(performance.now() * 0.03));
    else if (e.state === 'stun') this.setGlow(e, 0x4060ff, 0.35);
    else this.setGlow(e, 0x000000, 0);
    this.syncBody(e);
  }

  /** ザコ：近づく → 身構える（赤く光る）→ 飛びかかる → 隙 */
  private shadowAI(e: Enemy, dt: number): void {
    const p = this.host.player.pos;
    const dx = p.x - e.root.position.x;
    const dz = p.z - e.root.position.z;
    const d = Math.hypot(dx, dz);
    e.timer -= dt;
    switch (e.state) {
      case 'idle':
        if (d < 12) e.state = 'chase';
        break;
      case 'chase':
        this.face(e, dx, dz);
        if (d > 1.7) this.moveEnemy(e, (dx / d) * 1.9 * dt, (dz / d) * 1.9 * dt);
        if (d < 2.0 && e.cooldown <= 0) {
          e.state = 'windup';
          e.timer = 0.6;
          this.host.audio.play('growl');
          this.hint('windup');
        }
        break;
      case 'windup':
        this.face(e, dx, dz);
        if (e.timer <= 0) {
          e.state = 'lunge';
          e.timer = 0.24;
          e.dir.set(dx / Math.max(d, 1e-3), dz / Math.max(d, 1e-3));
        }
        break;
      case 'lunge':
        this.moveEnemy(e, e.dir.x * 7 * dt, e.dir.y * 7 * dt);
        if (d < 1.0) this.hurtPlayer(12, e.dir.x, e.dir.y);
        if (e.timer <= 0) {
          e.state = 'recover';
          e.timer = 0.8;
        }
        break;
      case 'recover':
        if (e.timer <= 0) {
          e.state = 'chase';
          e.cooldown = 0.6 + Math.random() * 0.6;
        }
        break;
      case 'hurt':
        // ひるんだあとは、すぐに反撃してくる
        if (e.timer <= 0) {
          e.state = 'chase';
          e.cooldown = 0.15;
        }
        break;
      default:
        e.state = 'chase';
    }
    // ふわふわ浮く
    e.root.position.y = 0.05 + Math.sin(performance.now() * 0.004 + e.home.x) * 0.05;
  }

  /** 中ボス：突進（壁に当たると気絶）・近くでは踏みつけ */
  private ninomiyaAI(e: Enemy, dt: number): void {
    const p = this.host.player.pos;
    const dx = p.x - e.root.position.x;
    const dz = p.z - e.root.position.z;
    const d = Math.hypot(dx, dz);
    const rage = e.hp <= e.def.hp / 2 ? 1.35 : 1;
    e.timer -= dt;
    switch (e.state) {
      case 'idle':
        if (d < 16) {
          e.state = 'chase';
          e.cooldown = 1.2;
        }
        break;
      case 'chase':
        this.face(e, dx, dz);
        if (d > 2.0) this.moveEnemy(e, (dx / d) * 1.1 * rage * dt, (dz / d) * 1.1 * rage * dt);
        if (e.cooldown <= 0) {
          if (d < 2.6) {
            e.state = 'windup';
            e.timer = 0.75 / rage;
            e.dir.set(0, 0); // 0 = 踏みつけ
            this.host.audio.play('growl');
            this.hint('windup');
          } else if (d < 14) {
            e.state = 'windup';
            e.timer = 1.0 / rage;
            e.dir.set(dx / d, dz / d); // 突進の向き
            this.host.audio.play('stomp');
            this.hint('charge');
          }
        }
        break;
      case 'windup':
        if (e.dir.lengthSq() > 0) {
          // 突進の構え：最後まで狙いを合わせてくる
          if (e.timer > 0.25) e.dir.set(dx / Math.max(d, 1e-3), dz / Math.max(d, 1e-3));
          this.face(e, e.dir.x, e.dir.y);
          if (e.timer <= 0) {
            e.state = 'charge';
            e.timer = 1.8;
          }
        } else if (e.timer <= 0) {
          e.state = 'slam';
          e.timer = 0.15;
          this.host.audio.play('slam');
          this.host.shake();
          if (d < 2.8) this.hurtPlayer(18, dx / Math.max(d, 1e-3), dz / Math.max(d, 1e-3));
        }
        break;
      case 'charge': {
        const before = e.root.position.clone();
        const step = 8 * rage * dt;
        this.moveEnemy(e, e.dir.x * step, e.dir.y * step);
        const moved = before.distanceTo(e.root.position);
        if (d < 1.4) this.hurtPlayer(25, e.dir.x, e.dir.y);
        if (moved < step * 0.4) {
          // 壁に激突して気絶
          e.state = 'stun';
          e.timer = 2.4;
          this.host.audio.play('slam');
          this.host.shake();
          this.hint('stun');
        } else if (e.timer <= 0) {
          e.state = 'recover';
          e.timer = 0.8;
        }
        break;
      }
      case 'slam':
        if (e.timer <= 0) {
          // 踏みつけの後は距離をとって、突進の構えに入る
          e.state = 'backoff';
          e.timer = 1.4;
        }
        break;
      case 'backoff':
        this.face(e, dx, dz);
        if (d > 0.01) this.moveEnemy(e, (-dx / d) * 2.4 * dt, (-dz / d) * 2.4 * dt);
        if (d > 6 || e.timer <= 0) {
          e.state = 'windup';
          e.timer = 1.0 / rage;
          e.dir.set(dx / Math.max(d, 1e-3), dz / Math.max(d, 1e-3));
          this.host.audio.play('stomp');
          this.hint('charge');
        }
        break;
      case 'stun':
        // ぐらぐら揺れる
        e.root.rotation.z = Math.sin(performance.now() * 0.02) * 0.08;
        if (e.timer <= 0) {
          e.root.rotation.z = 0;
          e.state = 'chase';
          e.cooldown = 1.0;
        }
        break;
      case 'recover':
        if (e.timer <= 0) {
          e.state = 'chase';
          e.cooldown = 0.9 / rage;
        }
        break;
      default:
        e.state = 'chase';
    }
  }

  private hurtPlayer(amount: number, nx: number, nz: number): void {
    if (this.iframe > 0) return;
    this.iframe = IFRAME_HURT;
    this.host.player.push(nx * 0.9, nz * 0.9);
    this.host.damage(amount);
    this.hint('hurt');
  }

  private moveEnemy(e: Enemy, dx: number, dz: number): void {
    const pos = { x: e.root.position.x, z: e.root.position.z };
    e.body.enabled = false;
    this.host.collision.move(pos, dx, dz, e.def.kind === 'ninomiya' ? 0.45 : 0.3);
    e.body.enabled = e.state !== 'dying';
    e.root.position.x = pos.x;
    e.root.position.z = pos.z;
  }

  private face(e: Enemy, dx: number, dz: number): void {
    e.root.rotation.y = Math.atan2(dx, dz);
  }

  private syncBody(e: Enemy): void {
    const r = e.def.kind === 'ninomiya' ? 0.45 : 0.3;
    const m = e.root.position;
    e.body.minX = m.x - r;
    e.body.maxX = m.x + r;
    e.body.minZ = m.z - r;
    e.body.maxZ = m.z + r;
    e.body.enabled = e.state !== 'dead' && e.state !== 'dying' && this.visible(e.root);
  }

  private setGlow(e: Enemy, color: number, k: number): void {
    for (const m of e.mats) {
      m.emissive.setHex(color);
      m.emissiveIntensity = k;
    }
  }

  private hint(key: CombatHintKey): void {
    if (this.shownHints.has(key)) return;
    const text = this.host.stage.combatHints?.[key];
    if (!text) return;
    this.shownHints.add(key);
    this.host.hud.hint(text, 3.5);
  }

  private updateBossBar(): void {
    const boss = this.enemies.find((e) => e.def.bossName && this.isActive(e) && e.state !== 'idle' && e.state !== 'dying');
    this.host.hud.setBoss(boss ? boss.def.bossName! : null, boss ? boss.hp / boss.def.hp : 0);
  }

  // ---------------- ムービー用（戦闘が止まっている間だけ使う） ----------------

  enemyRoot(id: string): THREE.Object3D {
    const e = this.enemies.find((x) => x.def.id === id);
    if (!e) throw new Error(`unknown enemy: ${id}`);
    return e.root;
  }

  demoPose(id: string, pose: DemoPose): void {
    const d = this.demo.get(id) ?? { pose: 'none', flash: 0 };
    d.pose = pose;
    this.demo.set(id, d);
  }

  demoFlash(id: string): void {
    const d = this.demo.get(id) ?? { pose: 'none' as DemoPose, flash: 0 };
    d.flash = 0.15;
    this.demo.set(id, d);
  }

  /** ムービー中、様子に合わせて光らせる・「！」を出す・ふらつかせる */
  demoUpdate(dt: number): void {
    const now = performance.now();
    for (const [id, d] of this.demo) {
      const e = this.enemies.find((x) => x.def.id === id)!;
      d.flash = Math.max(0, d.flash - dt);
      e.mark.visible = d.pose === 'windup';
      if (e.mark.visible) e.mark.scale.setScalar(0.42 + 0.06 * Math.sin(now * 0.02));
      e.root.rotation.z = d.pose === 'stun' ? Math.sin(now * 0.02) * 0.08 : 0;
      if (d.flash > 0) this.setGlow(e, 0xffffff, 0.9);
      else if (d.pose === 'windup') this.setGlow(e, 0xff2010, 0.5 + 0.5 * Math.sin(now * 0.03));
      else if (d.pose === 'rage') this.setGlow(e, 0xff3010, 0.55 + 0.3 * Math.sin(now * 0.05));
      else if (d.pose === 'stun') this.setGlow(e, 0x4060ff, 0.35);
      else this.setGlow(e, 0x000000, 0);
    }
  }

  endDemo(): void {
    for (const id of this.demo.keys()) {
      const e = this.enemies.find((x) => x.def.id === id)!;
      e.mark.visible = false;
      e.root.rotation.z = 0;
      this.setGlow(e, 0x000000, 0);
      this.syncBody(e);
    }
    this.demo.clear();
  }

  // ---------------- 竹刀（画面右下に見える） ----------------

  private makeWeapon(): THREE.Group {
    const g = new THREE.Group();
    const bamboo = new THREE.MeshLambertMaterial({ color: 0xc8b078 });
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.035, 0.95), bamboo);
    blade.position.z = -0.45;
    g.add(blade);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.045, 0.25), new THREE.MeshLambertMaterial({ color: 0x5a3020 }));
    grip.position.z = 0.1;
    g.add(grip);
    const guard = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.012, 10), new THREE.MeshLambertMaterial({ color: 0x222222 }));
    guard.rotation.x = Math.PI / 2;
    guard.position.z = -0.03;
    g.add(guard);
    g.position.set(0.32, -0.32, -0.55);
    g.visible = false;
    return g;
  }

  private updateWeapon(dt: number, paused: boolean): void {
    this.weapon.visible = this.armed && !paused;
    if (!this.weapon.visible) return;
    // 構え：少し右上に向けて持つ。振ると右上から左下へ
    let t = 0;
    if (this.swing > 0) {
      this.swing += dt / 0.3;
      t = Math.min(1, this.swing);
      if (this.swing >= 1) this.swing = 0;
    }
    const s = Math.sin(t * Math.PI);
    this.weapon.rotation.set(0.35 - s * 1.2, -0.25 + s * 0.6, -0.3 - s * 0.9);
    this.weapon.position.set(0.32 - s * 0.2, -0.32 + s * 0.05, -0.55);
  }
}

/** 予兆の「！」：赤い菱形に白い字 */
let markTex: THREE.Texture | null = null;
function markTexture(): THREE.Texture {
  if (markTex) return markTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.translate(64, 64);
  ctx.rotate(Math.PI / 4);
  ctx.fillStyle = 'rgba(200,20,10,0.92)';
  ctx.fillRect(-38, -38, 76, 76);
  ctx.strokeStyle = '#ffd8c8';
  ctx.lineWidth = 5;
  ctx.strokeRect(-38, -38, 76, 76);
  ctx.rotate(-Math.PI / 4);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 64px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('!', 0, 4);
  markTex = new THREE.CanvasTexture(c);
  markTex.colorSpace = THREE.SRGBColorSpace;
  return markTex;
}
