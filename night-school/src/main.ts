import * as THREE from 'three';
import { Game } from './game/game';
import { stages } from './stages';
import { QUALITY_LABELS, loadQuality, saveQuality, type Quality } from './engine/quality';
import { MODEL_NAMES, ModelLibrary } from './engine/models';

const stage = stages[0];
let game: Game | null = null;

// タイトル画面：最初のタップで音声を有効にして開始する
const title = document.createElement('div');
title.className = 'screen';
title.innerHTML = `
  <div class="episode">夜の学校　${stage.episode}</div>
  <h1>${stage.title}</h1>
  <div class="sub">怪異の「決まり」を調べ、校舎から脱出せよ。<br>ヘッドホン推奨</div>
  <div class="tap">読み込み中…</div>
  <div class="quality"><span>画質</span></div>`;
document.body.appendChild(title);

// 画質の切り替え（端末に覚えておく）
let quality: Quality = loadQuality(matchMedia('(pointer: coarse)').matches);
const qBox = title.querySelector('.quality')!;
for (const q of ['high', 'normal', 'low'] as const) {
  const b = document.createElement('button');
  b.textContent = QUALITY_LABELS[q];
  b.classList.toggle('sel', q === quality);
  // ボタンを押しても始まらないように
  b.addEventListener('pointerup', (e) => {
    e.stopPropagation();
    quality = q;
    saveQuality(q);
    qBox.querySelectorAll('button').forEach((x) => x.classList.toggle('sel', x === b));
  });
  qBox.appendChild(b);
}

// 読み込みが終わる前にタップされたら、終わりしだい始める
let tapped = false;
const begin = () => {
  if (!game || !tapped) return;
  title.remove();
  game.start(quality);
  game.input.grabKeyboard();
};
title.addEventListener(
  'pointerup',
  () => {
    tapped = true;
    // スマホでは全画面にする（対応していない端末では何もしない）
    if (matchMedia('(pointer: coarse)').matches) {
      document.documentElement.requestFullscreen?.({ navigationUI: 'hide' }).catch(() => {});
    }
    begin();
  },
  { once: true },
);

// 3D モデルを読み込んでから校舎を組み立てる（読み込めなかった物は箱で作る）
const tap = title.querySelector('.tap')!;
const models = new ModelLibrary();
void models
  .load(MODEL_NAMES, (done, total) => (tap.textContent = `読み込み中… ${Math.round((done / total) * 100)}%`))
  .then(() => {
    game = new Game(document.getElementById('app')!, stage, models);
    tap.textContent = 'タップしてはじめる';
    // ?debug を付けると、テスト用にゲームへ触れるようにする
    if (new URLSearchParams(location.search).has('debug')) Object.assign(window, { game, THREE });
    begin();
  });
