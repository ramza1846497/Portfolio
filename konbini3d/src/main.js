// 起動とゲームループ。3D表示・入力・UI・ゲーム状態をつなぐ。

import * as THREE from 'three';
import { Game, newGameSave } from './game.js';
import { PLAYER_SPAWN } from './world/store.js';
import { buildStore } from './world/storeView.js';
import { createEntityView } from './world/entityView.js';
import { createPlayerControls } from './player/controls.js';
import { createInteractor } from './player/interact.js';
import { createHud } from './ui/hud.js';
import { createLabelLayer } from './ui/labels.js';
import { createRegisterPanel } from './ui/registerPanel.js';
import { createOrderPanel } from './ui/orderPanel.js';
import { createFryerPanel } from './ui/fryerPanel.js';
import { createDayResult } from './ui/dayResult.js';
import { formatYen } from './logic/money.js';
import { loadSave, writeSave, clearSave } from './save.js';

const $ = (id) => document.getElementById(id);
const canvas = $('view');

// ---------- 3D ----------
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xbcd9ec);
const camera = new THREE.PerspectiveCamera(72, 1, 0.05, 60);
scene.add(camera);
scene.add(new THREE.HemisphereLight(0xffffff, 0xd8cfbd, 2.4));
const sun = new THREE.DirectionalLight(0xffffff, 1.1);
sun.position.set(3, 8, 5);
scene.add(sun);

const storeParts = buildStore(scene);
const staticTargets = [...storeParts.proxies, ...storeParts.blockers];
const entities = createEntityView(scene, camera, storeParts);
const controls = createPlayerControls(camera, canvas);
const interactor = createInteractor(camera);
const labels = createLabelLayer($('labels'));
const hud = createHud($('hud'));

function resize() {
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

// ---------- 状態 ----------
let game = null;
// title | play | panel | paused | result
let mode = 'title';
let openPanelName = null;
let currentTarget = null;
let currentInfo = null;
let holding = false;
let holdTimer = 0;

const getGame = () => game;
const panels = {
  register: createRegisterPanel($('panel-register'), {
    game: getGame,
    onClose: closePanel,
    onSale: (r) => hud.pop(r.ok ? `+${formatYen(r.total)}` : `−${formatYen(r.diff)}`, r.ok ? 'good' : 'bad'),
  }),
  order: createOrderPanel($('panel-order'), { game: getGame, onClose: closePanel }),
  fryer: createFryerPanel($('panel-fryer'), { game: getGame, onClose: closePanel }),
};
const dayResult = createDayResult($('screen-result'), { onNext: nextDay, onRestart: restart });

function handleEvent(type, p) {
  switch (type) {
    case 'toast': hud.toast(p.text, p.tone); break;
    case 'restock': hud.pop('+1'); break;
    case 'dispose': hud.pop('空箱を片付けた', 'info'); break;
    case 'cleaned': hud.pop('ピカピカ！'); break;
    case 'hotcase': hud.pop(`ケースに${p.count}個並べた`); break;
    case 'dayEnd': showResult(p); break;
  }
}

// ---------- ポインタロック ----------
// マウスを固定できない環境（埋め込み表示など）では、右ドラッグで見回す方式に切り替える
let everLocked = false;
let freeLook = false;

function lockFailed() {
  if (everLocked) {
    showPause();
    return;
  }
  if (!freeLook) {
    freeLook = true;
    controls.setDragLook(true);
    hud.setNote('この画面ではマウスを固定できないため、右ボタンを押しながらドラッグで見回します');
  }
  if (mode === 'paused' || mode === 'play') {
    mode = 'play';
    $('screen-pause').hidden = true;
  }
}

function requestLock() {
  if (freeLook) {
    lockFailed();
    return;
  }
  try {
    const p = canvas.requestPointerLock();
    if (p && typeof p.catch === 'function') p.catch(lockFailed);
  } catch {
    lockFailed();
  }
}
document.addEventListener('pointerlockerror', lockFailed);

function showPause() {
  if (mode === 'play' || mode === 'paused') {
    mode = 'paused';
    $('screen-pause').hidden = false;
  }
}

controls.look.addEventListener('lock', () => {
  everLocked = true;
  if (mode === 'result' || mode === 'title') return;
  mode = 'play';
  $('screen-pause').hidden = true;
});
controls.look.addEventListener('unlock', () => {
  holding = false;
  if (mode === 'play') showPause();
});
$('screen-pause').addEventListener('click', requestLock);
canvas.addEventListener('click', () => {
  if (mode === 'paused') requestLock();
});

// ---------- パネル ----------
function openPanel(name) {
  openPanelName = name;
  mode = 'panel';
  holding = false;
  panels[name].show();
  if (document.pointerLockElement) document.exitPointerLock();
}

function closePanel() {
  if (!openPanelName) return;
  panels[openPanelName].hide();
  openPanelName = null;
  mode = 'paused';
  $('screen-pause').hidden = false;
  requestLock();
}

// ---------- 1日の流れ ----------
function setupDay() {
  entities.reset();
  labels.clear();
  controls.reset(PLAYER_SPAWN);
  hud.setVisible(true);
  $('screen-start').hidden = true;
  dayResult.hide();
  mode = 'paused';
  $('screen-pause').hidden = false;
  hud.toast(`${game.state.day}日目。開店前に品出しをしておこう`, 'info');
  if (game.state.arrived) hud.toast(`発注した段ボールが${game.state.arrived}箱、バックヤードに届いています`, 'good');
  requestLock();
}

function startGame(save) {
  writeSave(save);
  game = new Game({ save, seed: Date.now() >>> 0, onEvent: handleEvent });
  setupDay();
}

function showResult(r) {
  if (openPanelName) {
    panels[openPanelName].hide();
    openPanelName = null;
  }
  mode = 'result';
  holding = false;
  $('screen-pause').hidden = true;
  if (document.pointerLockElement) document.exitPointerLock();
  if (r.gameOver) clearSave();
  dayResult.show(r);
}

function nextDay() {
  const save = game.nextDaySave();
  writeSave(save);
  game.loadDay(save);
  setupDay();
}

function restart() {
  const save = newGameSave();
  writeSave(save);
  game.loadDay(save);
  setupDay();
}

function renderStartButtons() {
  const save = loadSave();
  const box = $('start-buttons');
  box.innerHTML = save
    ? `<button type="button" class="btn btn--primary btn--big" data-action="continue">続きから（${save.day}日目・所持金 ${formatYen(save.money)}）</button>
       <button type="button" class="btn" data-action="new">最初から</button>`
    : '<button type="button" class="btn btn--primary btn--big" data-action="new">はじめる</button>';
  box.onclick = (e) => {
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (action === 'continue') startGame(save);
    if (action === 'new' && !save) startGame(newGameSave());
    // セーブがあるときは、2回押して確認する
    if (action === 'new' && save) {
      const btn = e.target.closest('[data-action]');
      btn.dataset.action = 'new-confirm';
      btn.textContent = 'もう一度押すと、セーブを消して最初から始めます';
    }
    if (action === 'new-confirm') startGame(newGameSave());
  };
}

// ---------- 入力 ----------
function act() {
  const r = game.use(currentTarget);
  if (!r?.panel) return;
  if (r.panel === 'register') game.openRegister();
  openPanel(r.panel);
}

document.addEventListener('mousedown', (e) => {
  if (e.button !== 0 || mode !== 'play') return;
  act();
  holding = true;
  holdTimer = 0.35;
});
document.addEventListener('mouseup', () => {
  holding = false;
});
window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape' && openPanelName) {
    closePanel();
    return;
  }
  if (e.code === 'Escape' && freeLook && mode === 'play') {
    holding = false;
    controls.releaseAll();
    showPause();
    return;
  }
  if (mode !== 'play') return;
  if (e.code === 'KeyQ') game.drop();
  if (e.code === 'Enter' && game.state.phase === 'prep') game.openStore();
});

// ---------- ループ ----------
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (game) {
    const running = mode === 'play' || mode === 'panel';
    controls.update(dt, mode === 'play');
    const p = game.state.player;
    p.x = controls.pos.x;
    p.z = controls.pos.z;
    p.fx = controls.forward.x;
    p.fz = controls.forward.z;
    if (running) game.update(dt);
    if (mode === 'play') {
      currentTarget = interactor.pick(entities.raycastTargets(staticTargets));
      currentInfo = game.describe(currentTarget);
      if (holding && currentTarget?.type === 'shelf' && currentInfo?.ok) {
        holdTimer -= dt;
        if (holdTimer <= 0) {
          act();
          holdTimer = 0.18;
        }
      }
    } else {
      currentTarget = null;
      currentInfo = null;
    }
    entities.update(game.state, game, running ? dt : 0);
    labels.begin();
    if (mode !== 'result') entities.labels(labels, game.state);
    labels.end();
    hud.update(game, currentInfo, dt);
    if (openPanelName) panels[openPanelName].update();
  }
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

renderStartButtons();
controls.reset(PLAYER_SPAWN);
window.__konbiniReady = true;
// 動作確認用（コンソールから状態を見られる）
window.__konbini = {
  get game() { return game; },
  get mode() { return mode; },
  get target() { return currentTarget; },
  renderer,
  camera,
  controls,
  // ポインタロックが使えない自動テスト用：歩行モードにする
  debugPlay() {
    mode = 'play';
    $('screen-pause').hidden = true;
  },
};
requestAnimationFrame(frame);
