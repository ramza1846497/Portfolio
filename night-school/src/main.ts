import * as THREE from 'three';
import { Game } from './game/game';
import { stages } from './stages';

const stage = stages[0];
const game = new Game(document.getElementById('app')!, stage);

// タイトル画面：最初のタップで音声を有効にして開始する
const title = document.createElement('div');
title.className = 'screen';
title.innerHTML = `
  <div class="episode">夜の学校　${stage.episode}</div>
  <h1>${stage.title}</h1>
  <div class="sub">怪異の「決まり」を調べ、校舎から脱出せよ。<br>ヘッドホン推奨</div>
  <div class="tap">タップしてはじめる</div>`;
document.body.appendChild(title);

title.addEventListener(
  'pointerup',
  () => {
    title.remove();
    // スマホでは全画面にする（対応していない端末では何もしない）
    if (matchMedia('(pointer: coarse)').matches) {
      document.documentElement.requestFullscreen?.({ navigationUI: 'hide' }).catch(() => {});
    }
    game.start();
  },
  { once: true },
);

// ?debug を付けると、テスト用にゲームへ触れるようにする
if (new URLSearchParams(location.search).has('debug')) {
  Object.assign(window, { game, THREE });
}
