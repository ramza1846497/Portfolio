import type { MovieApi, MovieScript } from '../../game/movie';
import { OZ } from './floor1';

/**
 * 敵紹介のショートムービー。
 * 文章で説明する代わりに、敵の動き・予兆・隙の作り方を映像で見せる。
 * 青白い人影は主人公の「こう来る」という予感の姿で、回避と反撃のお手本を見せる。
 */

/** 影：赤く光る → 飛びかかり → 着地の隙 */
const shadow: MovieScript = async (m) => {
  const e = m.enemy('shadow1');
  e.place(1.9, 0.1);
  e.face(5, 0);

  // 名前：顔に寄る
  // 名前のカードは左に出るので、影は画面の右に置く
  m.cam([3.3, 1.0, 0.7], [1.9, 0.85, 0.75]);
  void m.cam([2.95, 0.98, 0.5], [1.9, 0.9, 0.7], 2.6);
  m.sfx('growl');
  m.title('影', '階段の前にうずくまる、子どもの形をしたもの');
  await m.wait(2.6);

  // 肩越し：お手本の人影と向き合う
  e.place(2.0, 0);
  const g = m.ghost(5.4, 0, 2, 0);
  e.face(5.4, 0);
  m.cam([7.8, 1.55, 1.25], [3.8, 0.75, -0.35]);
  await e.move(3.0, 0, 0.9);

  // 予兆
  e.pose('windup');
  m.sfx('growl');
  m.caption('赤く光って「！」—— 飛びかかりの合図');
  await m.wait(0.9);

  // 飛びかかり：かわす瞬間だけスロー
  e.pose('none');
  m.caption('{dodge} で横へかわす');
  const lunge = e.move(5.1, 0, 0.42, 'in');
  await m.wait(0.18);
  m.slow(0.25);
  await g.dodge(5.4, -1.05);
  await m.wait(0.12);
  m.slow(1);
  await lunge;

  // 着地の隙を叩く
  m.caption('飛びかかった後は、隙だらけ');
  g.face(5.1, 0);
  void m.cam([7.4, 1.6, 1.15], [5.0, 0.8, -0.5], 0.5);
  await m.wait(0.5);
  m.caption('{attack} で叩く');
  await g.strike(e);
  await g.strike(e);
  await m.wait(0.3);

  await m.recap(['赤く光る「！」', '{dodge}', '隙に {attack}']);
};

/** 二宮金次郎像：踏み鳴らし → 突進 → 壁に激突して気絶 ／ 近くでは踏みつけ */
const ZG1 = OZ + 21;
const ninomiya: MovieScript = async (m) => {
  const e = m.enemy('ninomiya');

  // 名前：見上げる
  e.place(22, 95.8);
  e.face(22, 80);
  m.cam([22.5, 1.0, 92.4], [23.0, 1.9, 95.8]);
  void m.cam([22.4, 0.9, 92.9], [22.9, 2.0, 95.8], 2.8);
  m.sfx('stomp');
  m.shake(0.4);
  m.title('走る二宮金次郎像', '台座をおりて、夜の校舎を走る石の像');
  await m.wait(2.8);

  // 引き：突進の予兆
  const x = 17;
  e.place(x, 95);
  e.face(x, 80);
  const g = m.ghost(x, 87, x, 95);
  m.cam([x + 4.6, 2.0, 92], [x + 0.3, 1.0, 89]);
  await m.wait(0.5);
  e.pose('windup');
  m.sfx('stomp');
  m.shake(0.5);
  m.caption('足を踏み鳴らして「！」—— 突進の合図');
  await m.wait(1.1);

  // 突進：引きつけて、横へ
  e.pose('none');
  m.caption('{dodge} で横へかわす');
  const charge = e.move(x, ZG1 + 0.6, 1.5, 'in');
  await m.wait(0.82);
  m.slow(0.25);
  await g.dodge(x + 2.1, 87);
  await m.wait(0.1);
  m.slow(1);
  await charge;

  // 壁に激突 → 気絶
  m.sfx('slam');
  m.shake(1.2);
  e.pose('stun');
  m.caption('壁に激突すると、しばらく動けない');
  await m.cam([x + 3.6, 1.6, ZG1 + 4.6], [x, 1.2, ZG1 + 0.8], 0.6);
  await m.wait(0.4);
  m.caption('今が好機 —— {attack} が大きく効く');
  g.face(x, ZG1 + 0.6);
  await g.move(x + 0.9, ZG1 + 2.0, 0.4);
  g.face(x, ZG1 + 0.6);
  await g.strike(e, true);
  await g.strike(e, true);
  await g.strike(e, true);

  // 近くでは踏みつけ
  e.pose('none');
  e.face(x + 0.9, ZG1 + 2.0);
  m.caption('近づきすぎると —— 踏みつけ');
  m.cam([x + 4.6, 1.8, ZG1 + 2.6], [x + 0.6, 1.0, ZG1 + 2.0]);
  e.pose('windup');
  m.sfx('growl');
  await m.tween(0.55, (k) => (e.root.position.y = 0.35 * Math.sin((k * Math.PI) / 2)));
  m.caption('{dodge} で後ろへ下がる');
  m.slow(0.35);
  await g.dodge(x + 1.4, ZG1 + 4.2);
  m.slow(1);
  e.pose('none');
  await m.tween(0.08, (k) => (e.root.position.y = 0.35 * (1 - k)));
  m.sfx('slam');
  m.shake(1);
  await m.wait(0.6);

  await m.recap(['踏み鳴らし「！」', '{dodge} で横へ', '壁で気絶', '{attack}']);
};

/** 体力が半分を切ったとき：目が燃えて、速くなる */
const ninomiyaRage: MovieScript = async (m: MovieApi) => {
  const e = m.enemy('ninomiya');
  const r = e.root.position;
  // プレイヤーの側から寄る（間に壁がない）
  const dx = m.player.x - r.x;
  const dz = m.player.z - r.z;
  const d = Math.max(Math.hypot(dx, dz), 1e-3);
  const cx = r.x + (dx / d) * 2.6;
  const cz = r.z + (dz / d) * 2.6;
  e.face(cx, cz);
  m.cam([cx, 1.1, cz], [r.x, 1.9, r.z]);
  void m.cam([r.x + (dx / d) * 2.0, 1.0, r.z + (dz / d) * 2.0], [r.x, 2.0, r.z], 2.2);
  m.sfx('growl');
  m.shake(0.8);
  e.pose('rage');
  m.caption('怒り —— 動きが速くなる');
  await m.wait(2.2);
};

export const movies: Record<string, MovieScript> = { shadow, ninomiya, ninomiyaRage };
