import * as THREE from 'three';

/*
 * 化け物の動き（手続き的アニメーション）。
 *  - 手足は地面の一点を踏みしめ、体が進むと一本ずつ踏み替える（2 関節の IK で肘・膝を曲げる）
 *  - 首はいつもこちらを追い、遅れてじわりと向き直る
 *  - 体重：歩くたびに沈み、踏み出す側へ傾く
 *  - 溜めと余韻：飛びかかる前に低く沈み、打たれると跳ね返ってから戻る
 * どの値も目標へ減衰しながら近づくので、切り替わりがなめらかになる。
 */

export interface CreatureRig {
  /** state：戦闘の状態名かムービーの様子。target：見つめる先（プレイヤーの目の位置、ワールド座標） */
  update(dt: number, state: string, target?: THREE.Vector3): void;
}

/** 目標へ指数的に近づける（rate が大きいほど速い） */
export function damp(x: number, to: number, rate: number, dt: number): number {
  return x + (to - x) * (1 - Math.exp(-rate * dt));
}

function smooth01(x: number): number {
  const c = Math.min(1, Math.max(0, x));
  return c * c * (3 - 2 * c);
}


const tmpM = new THREE.Matrix4();

/**
 * 2 関節の IK：upper（肩・股）と lower（肘・膝）を回し、先端（手首・足首）を target（ワールド座標）へ届かせる。
 * upperVec・lowerVec は、何も回していないときの各骨の向きと長さ（それぞれの関節の座標で）。
 * pole は肘・膝を曲げる向き（ワールド座標の方向）
 */
export function solveIK(upper: THREE.Object3D, lower: THREE.Object3D, upperVec: THREE.Vector3, lowerVec: THREE.Vector3, target: THREE.Vector3, pole: THREE.Vector3): void {
  const parent = upper.parent!;
  parent.updateWorldMatrix(true, false);
  // 親の座標で解く（親の拡大・縮小もそのまま扱える）
  const inv = tmpM.copy(parent.matrixWorld).invert();
  const T = target.clone().applyMatrix4(inv);
  const S = upper.position.clone();
  const poleL = pole.clone().transformDirection(inv);
  const a = upperVec.length();
  const b = lowerVec.length();
  const toT = T.clone().sub(S);
  const d = Math.min(Math.max(toT.length(), Math.abs(a - b) + 1e-3), a + b - 1e-3);
  const dir = toT.normalize();
  const cosA = (a * a + d * d - b * b) / (2 * a * d);
  const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
  const side = poleL.clone().sub(dir.clone().multiplyScalar(poleL.dot(dir)));
  if (side.lengthSq() < 1e-8) side.set(0, 0, 1).sub(dir.clone().multiplyScalar(dir.z));
  side.normalize();
  const E = S.clone().add(dir.clone().multiplyScalar(cosA * a)).add(side.multiplyScalar(sinA * a));
  // 上の骨：休みの向き → 肘・膝へ
  const qU = new THREE.Quaternion().setFromUnitVectors(upperVec.clone().normalize(), E.clone().sub(S).normalize());
  upper.quaternion.copy(qU);
  // 下の骨：上の骨の座標で、休みの向き → 先端へ
  const Tend = S.clone().add(dir.multiplyScalar(d));
  const want = Tend.sub(E).normalize().applyQuaternion(qU.clone().invert());
  lower.quaternion.setFromUnitVectors(lowerVec.clone().normalize(), want);
}

/** 地面を踏む手足の一本：踏んでいる場所（ワールド）と、踏み替えの途中経過 */
class Contact {
  planted = new THREE.Vector3();
  from = new THREE.Vector3();
  to = new THREE.Vector3();
  t = 1;
  dur = 0.2;
  lift = 0.08;
  ready = false;
  /** 今の先端の位置（ワールド） */
  pos = new THREE.Vector3();

  get stepping(): boolean {
    return this.t < 1;
  }

  start(to: THREE.Vector3, dur: number, lift: number): void {
    this.from.copy(this.pos);
    this.to.copy(to);
    this.t = 0;
    this.dur = dur;
    this.lift = lift;
  }

  update(dt: number, desired: THREE.Vector3): void {
    if (!this.ready) {
      this.planted.copy(desired);
      this.pos.copy(desired);
      this.ready = true;
    }
    if (this.t < 1) {
      // 踏み出しながらも行き先は追いかける（体が曲がっても足が置いていかれない）
      this.to.lerp(desired, Math.min(1, dt * 6));
      this.t = Math.min(1, this.t + dt / this.dur);
      const e = smooth01(this.t);
      this.pos.lerpVectors(this.from, this.to, e);
      this.pos.y += Math.sin(Math.PI * this.t) * this.lift;
      if (this.t >= 1) this.planted.copy(this.to);
    } else {
      this.pos.copy(this.planted);
    }
  }
}

/** ときどき新しい値を選んで、ゆっくりそこへ向かう（生き物の「間」をつくる） */
class Drift {
  value: number;
  private target: number;
  private wait = 0;
  constructor(
    private min: number,
    private max: number,
    private holdMin: number,
    private holdMax: number,
    private rate: number,
  ) {
    this.value = this.target = (min + max) / 2;
  }
  update(dt: number): number {
    this.wait -= dt;
    if (this.wait <= 0) {
      this.target = this.min + Math.random() * (this.max - this.min);
      this.wait = this.holdMin + Math.random() * (this.holdMax - this.holdMin);
    }
    this.value = damp(this.value, this.target, this.rate, dt);
    return this.value;
  }
}

/** 首を target の方へ向ける回転（親の座標）。maxAngle を超えては曲げない */
function lookRotation(neck: THREE.Object3D, target: THREE.Vector3, maxAngle: number): THREE.Quaternion {
  const parent = neck.parent!;
  parent.updateWorldMatrix(true, false);
  const local = target.clone().applyMatrix4(tmpM.copy(parent.matrixWorld).invert()).sub(neck.position).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), local);
  const angle = 2 * Math.acos(Math.min(1, Math.abs(q.w)));
  if (angle > maxAngle) q.slerp(new THREE.Quaternion(), 1 - maxAngle / angle);
  return q;
}

export interface ShadowParts {
  root: THREE.Object3D;
  body: THREE.Object3D;
  J: Record<string, THREE.Object3D>;
  /** 腕・脚の骨の向き（各関節の座標） */
  arm: { upper: (side: -1 | 1) => THREE.Vector3; lower: (side: -1 | 1) => THREE.Vector3 };
  leg: { upper: (side: -1 | 1) => THREE.Vector3; lower: (side: -1 | 1) => THREE.Vector3 };
  /** 毎フレームの追加の動き（髪・目の光・煙など） */
  extra?: (dt: number, state: string, t: number, speed: number) => void;
}

/**
 * 影の子ども：ふだんは猫背で立ち、首を傾けてこちらを見つめる。
 * 追ってくると四つん這いになり、手と足で床をつかみながら這い寄る（肘は蜘蛛のように外へ張る）。
 * 飛びかかる前は手足を踏ん張って低く沈み、飛びかかると両手を顔へ伸ばす。
 */
export function shadowCreature(p: ShadowParts): CreatureRig {
  const { root, body, J } = p;
  const hands = { L: new Contact(), R: new Contact() };
  const feet = { L: new Contact(), R: new Contact() };
  let crawl = 0;
  let crouch = 0;
  let reach = 0;
  let recoil = 0;
  let rear = 0;
  let t = Math.random() * 50;
  let state = '';
  let since = 0;
  let speed = 0;
  const last = new THREE.Vector3().copy(root.position);
  const roll = new Drift(-0.25, 1.1, 2.5, 6, 1.1);
  const curl = { L: new Drift(0.2, 0.75, 0.6, 2.5, 5), R: new Drift(0.2, 0.75, 0.6, 2.5, 5) };
  const gazeQ = new THREE.Quaternion();
  let gazeInit = false;
  const lookAt = new THREE.Vector3();
  const fwd = new THREE.Vector3();
  const v = new THREE.Vector3();
  let lastPair = 0;

  return {
    update(dt, s, target) {
      dt = Math.min(dt, 0.05);
      t += dt;
      if (s !== state) {
        state = s;
        since = 0;
      } else since += dt;
      root.updateWorldMatrix(true, false);
      const moved = v.set(root.position.x - last.x, 0, root.position.z - last.z);
      last.copy(root.position);
      speed = damp(speed, dt > 0 ? moved.length() / dt : 0, 8, dt);
      // 進む向き（ローカル）。踏み出す足を少し先へ置く
      const velLocal = moved.clone().divideScalar(Math.max(dt, 1e-3)).applyQuaternion(root.getWorldQuaternion(new THREE.Quaternion()).invert());

      // 姿勢の大きな切り替え：立つ ⇔ 這う、沈む（溜め）、伸びる（飛びかかり）、のけぞる（被弾）
      const crawling = ['chase', 'windup', 'lunge', 'recover', 'hurt'].includes(state);
      crawl = damp(crawl, crawling ? 1 : 0, crawling ? 3.2 : 1.6, dt);
      crouch = damp(crouch, state === 'windup' ? 1 : 0, 6, dt);
      reach = damp(reach, state === 'lunge' ? 1 : 0, state === 'lunge' ? 16 : 5, dt);
      recoil = damp(recoil, state === 'hurt' && since < 0.18 ? 1 : 0, state === 'hurt' && since < 0.18 ? 22 : 4, dt);
      rear = damp(rear, state === 'dying' ? 1 : 0, 3, dt);

      // 体の高さと前傾
      const breath = Math.sin(t * 1.9) * 0.012;
      body.position.y = -0.1 * crawl - 0.09 * crouch + 0.05 * reach + 0.04 * recoil + breath * (1 - crawl);
      body.position.z = -0.1 * crouch + 0.12 * reach - 0.12 * recoil;
      const torso = J.torso;
      const pitch = 0.3 * (1 - crawl) + 1.1 * crawl - 0.25 * crouch - 0.4 * reach - 0.9 * recoil - 1.4 * rear;
      const sway = crawl * Math.sin(t * 7) * Math.min(1, speed / 1.5) * 0.06;
      torso.rotation.set(0.14 + pitch, sway * 0.5, sway, 'YXZ');
      // 肩の盛り上がり（溜めると肩甲骨が浮く）
      const shoulderUp = 0.03 * crouch + breath * 0.5;

      // 首：こちらを追う（遅れて、じわりと）。ときどき首を大きく傾けて止まる
      if (target) lookAt.copy(target);
      else lookAt.copy(root.localToWorld(new THREE.Vector3(0, 1.2, 3)));
      const want = lookRotation(J.neck, lookAt, 1.7);
      if (!gazeInit) {
        gazeQ.copy(want);
        gazeInit = true;
      }
      gazeQ.slerp(want, 1 - Math.exp(-dt * (state === 'lunge' ? 10 : 2.2)));
      const r = roll.update(dt) * (1 - reach) + recoil * 0.6;
      const qRoll = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), r);
      J.neck.quaternion.copy(gazeQ).multiply(qRoll);
      J.head.rotation.set(-0.15 * recoil, 0, 0);

      // 脚：立っているときは足もと、這うときは体の後ろ。踏み替えは左右交互
      for (const side of [-1, 1] as const) {
        const k = side < 0 ? 'L' : 'R';
        const home = new THREE.Vector3(side * (0.07 + 0.06 * crawl), 0.03, 0.02 - 0.32 * crawl - 0.1 * crouch + 0.25 * reach);
        const lead = velLocal.clone().multiplyScalar(0.12);
        lead.y = 0;
        const desired = root.localToWorld(home.add(lead));
        const c = feet[k];
        c.update(dt, desired);
        const other = feet[side < 0 ? 'R' : 'L'];
        if (!c.stepping && !other.stepping && c.planted.distanceTo(desired) > 0.16) c.start(desired, Math.max(0.14, 0.3 - speed * 0.06), 0.06 + 0.04 * crawl);
        // 飛びかかりの間は、足を床から離して後ろへ伸ばす
        const tgt = c.pos.clone();
        if (reach > 0.01) tgt.lerp(root.localToWorld(new THREE.Vector3(side * 0.1, 0.25, -0.55)), reach);
        const pole = root.localToWorld(new THREE.Vector3(0, -0.6 * crawl, 1)).sub(root.getWorldPosition(new THREE.Vector3())).normalize();
        solveIK(J['hip' + k], J['knee' + k], p.leg.upper(side), p.leg.lower(side), tgt, pole);
      }

      // 腕：立っているときは膝の脇に垂らし（肘を少し曲げて緊張させる）、這うときは床をつかむ
      root.getWorldDirection(fwd);
      for (const side of [-1, 1] as const) {
        const k = side < 0 ? 'L' : 'R';
        const c = hands[k];
        const homeCrawl = new THREE.Vector3(side * 0.34, 0.03, 0.5 - 0.08 * crouch);
        const lead = velLocal.clone().multiplyScalar(0.14);
        lead.y = 0;
        const desired = root.localToWorld(homeCrawl.add(lead));
        c.update(dt, desired);
        // 手は対角の足と組になって踏み替える（左手と右足、右手と左足）
        const pair = side < 0 ? 0 : 1;
        const other = hands[side < 0 ? 'R' : 'L'];
        if (crawl > 0.5 && !c.stepping && !other.stepping && c.planted.distanceTo(desired) > 0.2 && (lastPair !== pair || other.planted.distanceTo(desired) > 0.5)) {
          c.start(desired, Math.max(0.13, 0.28 - speed * 0.06), 0.12);
          lastPair = pair;
        }
        // 立っているときの手：膝の横あたり。息に合わせてわずかに上下
        const hang = root.localToWorld(new THREE.Vector3(side * 0.21, 0.36 + shoulderUp, 0.1));
        const tgt = hang.lerp(c.pos, smooth01((crawl - 0.25) / 0.6));
        // 飛びかかり：両手をこちらの顔へ
        if (reach > 0.01) tgt.lerp(lookAt.clone().add(new THREE.Vector3(side * 0.12, -0.15, 0)), reach);
        // 断末魔：両腕を天へ
        if (rear > 0.01) tgt.lerp(root.localToWorld(new THREE.Vector3(side * 0.25, 1.9, 0.1)), rear);
        // 肘は外と上へ張り出す（這うと蜘蛛のよう）
        const pole = root.localToWorld(new THREE.Vector3(side * 1, 0.4 + 1.4 * crawl, -0.6 + 0.4 * crawl)).sub(root.getWorldPosition(new THREE.Vector3())).normalize();
        solveIK(J['sh' + k], J['el' + k], p.arm.upper(side), p.arm.lower(side), tgt, pole);
        // 手のひら：這うときは床に伏せ、指先は前へ。立つときは腕の延長
        const wr = J['wr' + k];
        wr.parent!.updateWorldMatrix(true, false);
        const inv = new THREE.Matrix4().copy(wr.parent!.matrixWorld).invert();
        const f1 = fwd.clone().add(new THREE.Vector3(side * 0.3, 0, 0)).normalize().transformDirection(inv);
        const n1 = new THREE.Vector3(0, -1, 0).transformDirection(inv);
        n1.sub(f1.clone().multiplyScalar(n1.dot(f1))).normalize();
        const f0 = new THREE.Vector3(0, -1, 0);
        const n0 = new THREE.Vector3(-side, 0, 0);
        const m0 = new THREE.Matrix4().makeBasis(f0, n0, f0.clone().cross(n0));
        const m1 = new THREE.Matrix4().makeBasis(f1, n1, f1.clone().cross(n1));
        const qFlat = new THREE.Quaternion().setFromRotationMatrix(m1.multiply(m0.transpose()));
        const flat = smooth01((crawl - 0.3) / 0.6) * (1 - reach) * (1 - rear);
        wr.quaternion.copy(new THREE.Quaternion().slerp(qFlat, flat));
        // 指：床では爪を立ててつかみ、宙では間をおいて握ったり開いたり。飛びかかると鉤爪に
        let cv = curl[k].update(dt);
        cv = cv * (1 - flat) + 0.7 * flat;
        if (c.stepping && flat > 0.5) cv = 0.25;
        cv = cv * (1 - reach) + 1.1 * reach;
        cv = cv * (1 - crouch * 0.6) - 0.35 * crouch * (1 - flat);
        cv = cv * (1 - rear) - 0.4 * rear;
        J['kn' + k].rotation.set(0, 0, -side * cv);
        J['tip' + k].rotation.set(0, 0, -side * cv * 1.2);
      }
      // 溜めの間だけ、体がこまかく震える
      if (crouch > 0.05) torso.rotation.z += crouch * 0.025 * Math.sin(t * 37);
      p.extra?.(dt, state, t, speed);
    },
  };
}

export interface StatueParts {
  root: THREE.Object3D;
  body: THREE.Object3D;
  J: Record<string, THREE.Object3D>;
  extra?: (dt: number, state: string, t: number) => void;
}

/**
 * 二宮金次郎像：石の脚は曲がらない。一歩ごとに体が沈み、踏み出す側へ重く傾く。
 * 本を読みながらも、近くにいると首だけがこちらを追い続ける（目が合う）。
 */
export function statueCreature(p: StatueParts): CreatureRig {
  const { root, body, J } = p;
  let t = 0;
  let state = '';
  let since = 0;
  let speed = 0;
  let walked = 0;
  const last = new THREE.Vector3().copy(root.position);
  const cur: Record<string, number> = {};
  const go = (key: string, to: number, rate: number, dt: number) => (cur[key] = damp(cur[key] ?? to, to, rate, dt));
  const gazeQ = new THREE.Quaternion();
  let watch = 0;

  return {
    update(dt, s, target) {
      dt = Math.min(dt, 0.05);
      t += dt;
      if (s !== state) {
        state = s;
        since = 0;
      } else since += dt;
      const moved = Math.hypot(root.position.x - last.x, root.position.z - last.z);
      last.copy(root.position);
      walked += moved;
      speed = damp(speed, dt > 0 ? moved / dt : 0, 6, dt);
      const rage = root.userData.rage === true;
      const g = Math.min(1, speed / 0.9);
      // 歩き：一歩 0.9m。脚は棒のまま股から振る。両脚がそろう瞬間が一番高く、開いた瞬間に沈む
      const ph = (walked / 0.9) * Math.PI * (state === 'backoff' ? -1 : 1);
      const stride = Math.sin(ph);
      let hipL = 0.4 * stride * g;
      let hipR = -0.4 * stride * g;
      let y = -0.06 * stride * stride * g;
      let pitch = 0.08 * g;
      let roll = 0.07 * Math.sin(ph) * g;
      let twist = 0.1 * Math.sin(ph) * g;
      let arms = 0.05 * Math.sin(t * 0.6);
      let rate = 4;
      let watchWant = 1;
      switch (state) {
        case 'windupCharge':
          pitch = 0.55;
          arms = 0.95;
          y = -0.1;
          hipL = -0.3;
          hipR = 0.35;
          roll = 0.03 * Math.sin(t * 23);
          rate = 4;
          break;
        case 'charge':
          pitch = 0.55;
          arms = 0.6;
          hipL = 0.6 * stride;
          hipR = -0.6 * stride;
          y = -0.08 * stride * stride - 0.04;
          rate = 10;
          break;
        case 'windupStomp': {
          const r = smooth01(since / 0.5);
          hipR = -1.15 * r;
          hipL = 0.1 * r;
          pitch = -0.18 * r;
          roll = -0.1 * r;
          arms = -0.85 * r;
          y = 0.03 * r;
          rate = 5;
          break;
        }
        case 'slam':
          hipR = 0.15;
          pitch = 0.4;
          arms = 0.35;
          y = -0.1;
          rate = 22;
          break;
        case 'stun':
          pitch = 0.3;
          roll = 0.18 * Math.sin(t * 2.2);
          arms = 0.7;
          y = -0.04;
          watchWant = 0;
          rate = 3;
          break;
        case 'rage':
          pitch = -0.1;
          arms = -0.45;
          roll = 0.03 * Math.sin(t * 19);
          rate = 3;
          break;
        case 'dying':
          pitch = 0.5;
          arms = 1.0;
          watchWant = 0;
          rate = 2;
          break;
        case 'idle':
        case 'none':
          // 本を読んでいる。近くに来ると、首だけがこちらへ回る
          watchWant = target && target.distanceTo(root.getWorldPosition(new THREE.Vector3())) < 7 ? 1 : 0;
          break;
      }
      body.position.y = go('y', y, rate, dt);
      J.torso.rotation.set(go('pitch', pitch, rate, dt), go('twist', twist, rate, dt), go('roll', roll, rate, dt), 'YXZ');
      J.hipL.rotation.x = go('hipL', hipL, rate * 1.5, dt);
      J.hipR.rotation.x = go('hipR', hipR, rate * 1.5, dt);
      J.arms.rotation.x = go('arms', arms, rate, dt);
      // 首：石がきしむように、ゆっくりこちらへ向き直る。怒ると首が横に傾いたまま
      watch = damp(watch, watchWant, 0.8, dt);
      const reading = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.4, 0, 0));
      const look = target ? lookRotation(J.neck, target, 1.4) : reading;
      gazeQ.slerp(look, 1 - Math.exp(-dt * 1.3));
      const tilt = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), rage ? 0.45 : 0);
      J.neck.quaternion.copy(reading).slerp(gazeQ, watch).multiply(tilt);
      p.extra?.(dt, state, t);
    },
  };
}

