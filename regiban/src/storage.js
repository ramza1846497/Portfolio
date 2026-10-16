// ハイスコア保存。localStorage が使えない環境でもゲームは動くようにする。

const KEY = 'regiban.highscore';

export function loadHighScore() {
  try {
    const value = Number(localStorage.getItem(KEY));
    return Number.isInteger(value) && value > 0 ? value : 0;
  } catch {
    return 0;
  }
}

export function saveHighScore(score) {
  try {
    localStorage.setItem(KEY, String(score));
    return true;
  } catch {
    return false;
  }
}
