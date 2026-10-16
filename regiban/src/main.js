// 起動と画面遷移

import { Game, managerComment } from './game.js';
import { createRng } from './rng.js';
import { createUI } from './ui.js';
import { loadHighScore, saveHighScore } from './storage.js';

let game = null;
let rafId = 0;
let seed = 0;

const ui = createUI({
  onStart: startShift,
  onTitle: showTitle,
  onMoney: (value) => game?.addMoney(value),
  onRemove: (value) => game?.removeMoney(value),
  onClear: () => game?.clearTray(),
  onGive: () => game?.submit(),
});

function showTitle() {
  ui.renderTitle(loadHighScore());
  ui.showScreen('title');
}

function startShift() {
  cancelAnimationFrame(rafId);
  seed = (Date.now() ^ (Math.random() * 0x100000000)) >>> 0;
  game = new Game({ seed, onEvent: handleEvent });
  ui.showScreen('game');
  game.start(performance.now());
  ui.renderGame(game.state);
  rafId = requestAnimationFrame(loop);
}

function loop(now) {
  game.update(now);
  if (game.state.phase !== 'playing') return;
  ui.renderGame(game.state);
  rafId = requestAnimationFrame(loop);
}

function handleEvent(type, payload) {
  if (type === 'end') {
    finishShift(payload);
    return;
  }
  ui.handleEvent(type, payload);
  // 入力による変化はすぐ反映する（次のフレームを待たない）
  if (type === 'tray' || type === 'result') ui.renderGame(game.state);
}

function finishShift(result) {
  const previous = loadHighScore();
  const isNewHigh = result.score > previous;
  if (isNewHigh) saveHighScore(result.score);
  ui.renderResult({
    ...result,
    isNewHigh,
    highScore: Math.max(previous, result.score),
    comment: managerComment(result.score, createRng(seed + 1)),
  });
  ui.showScreen('result');
}

showTitle();
