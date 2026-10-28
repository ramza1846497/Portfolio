import type { MovieScript } from '../../game/movie';
import { OZ } from './floor1';

/**
 * 敵の登場演出。プレイ画面のまま視線が敵に向き、敵がその場で本当に動いてみせる。
 * 言葉では説明しない：予兆（赤い光と「！」）→ 攻撃 → 隙（崩れる・ぐらつく）を、動きだけで見せる。
 * 敵は動き終わった場所から、そのまま戦闘に入る。
 */

/** 影：身構える → 目の前まで飛びかかってくる → 着地して前のめりに崩れる（隙） */
const shadow: MovieScript = async (m) => {
  const e = m.enemy('shadow1');
  const p = m.player;
  e.face(p.x, p.z);
  m.look(e, 0.85, 4);
  void m.zoom(52, 1.0);
  await m.wait(0.9);

  // 予兆
  m.sfx('growl');
  e.pose('windup');
  await m.wait(0.75);

  // 飛びかかり：目の前で止まる
  e.pose('none');
  const r = e.root.position;
  const dx = p.x - r.x;
  const dz = p.z - r.z;
  const d = Math.max(Math.hypot(dx, dz), 1e-3);
  const stop = Math.max(0, d - 2.1);
  m.sfx('dodge');
  m.look(e, 0.85, 9);
  void m.zoom(64, 0.3);
  await e.move(r.x + (dx / d) * stop, r.z + (dz / d) * stop, 0.3, 'in');
  m.shake(0.5);

  // 着地の隙：前のめりに崩れて、しばらく動かない
  await m.tween(0.2, (k) => (e.root.rotation.x = 0.4 * k));
  await m.wait(1.0);
  m.sfx('growl');
  await m.tween(0.35, (k) => (e.root.rotation.x = 0.4 * (1 - k)));
  void m.zoom(70, 0.6);
  await m.wait(0.4);
};

/** 二宮金次郎像：踏み鳴らす → 横をかすめて突進 → 壁に激突してぐらつく（隙） → こちらを向く */
const ZG1 = OZ + 21;
const GX1 = 8;
const GX2 = 36;
const ninomiya: MovieScript = async (m) => {
  const e = m.enemy('ninomiya');
  const p = m.player;
  e.face(p.x, p.z);
  m.look(e, 1.9, 3);
  void m.zoom(38, 1.2);
  await m.wait(1.0);

  // 予兆：二度、床を踏み鳴らす
  m.sfx('stomp');
  m.shake(0.4);
  await m.wait(0.5);
  m.sfx('stomp');
  m.shake(0.6);
  e.pose('windup');
  await m.wait(0.9);

  // 突進：すぐ横をかすめて、北の壁へ
  const tx = p.x - 5.5 > GX1 + 1 ? p.x - 5.5 : Math.min(p.x + 5.5, GX2 - 1);
  const tz = ZG1 + 0.6;
  e.face(tx, tz);
  e.pose('none');
  m.look(e, 1.4, 8);
  void m.zoom(66, 0.6);
  await e.move(tx, tz, 1.3, 'in');

  // 激突 → ぐらつく（隙）
  m.sfx('slam');
  m.shake(1.3);
  e.pose('stun');
  m.look(e, 1.4, 4);
  await m.wait(1.7);
  e.pose('none');

  // 起き上がって、こちらを向く
  m.sfx('growl');
  const from = e.root.rotation.y;
  const to = Math.atan2(p.x - tx, p.z - tz);
  await m.tween(0.5, (k) => (e.root.rotation.y = from + (to - from) * k));
  void m.zoom(70, 0.6);
  await m.wait(0.5);
};

/** 体力が半分を切ったとき：目が燃える */
const ninomiyaRage: MovieScript = async (m) => {
  const e = m.enemy('ninomiya');
  e.face(m.player.x, m.player.z);
  m.look(e, 1.9, 6);
  void m.zoom(54, 0.5);
  m.sfx('growl');
  m.shake(0.8);
  e.pose('rage');
  await m.wait(1.4);
  void m.zoom(70, 0.4);
  await m.wait(0.3);
};

export const movies: Record<string, MovieScript> = { shadow, ninomiya, ninomiyaRage };
