// 3D空間の位置に重ねるHTMLラベル（客の吹き出し・我慢ゲージ、フライヤーの進み具合）。

import * as THREE from 'three';

const v = new THREE.Vector3();

export function createLabelLayer(container) {
  const pool = new Map();
  let frame = 0;

  function get(key) {
    let entry = pool.get(key);
    if (!entry) {
      const el = document.createElement('div');
      el.className = 'label';
      el.innerHTML = '<div class="label__text"></div><div class="label__bar"><div class="label__fill"></div></div>';
      container.append(el);
      entry = { el, text: el.children[0], bar: el.children[1], fill: el.children[1].children[0], seen: 0, lastText: null, lastTone: null };
      pool.set(key, entry);
    }
    return entry;
  }

  return {
    begin() {
      frame += 1;
    },
    // ratio が null ならゲージを出さない
    place(key, x, y, z, camera, { text = '', ratio = null, tone = '' } = {}) {
      v.set(x, y, z);
      const dist = v.distanceTo(camera.position);
      v.project(camera);
      if (v.z > 1 || dist > 14 || Math.abs(v.x) > 1.2 || Math.abs(v.y) > 1.2 || (!text && ratio === null)) return;
      const e = get(key);
      e.seen = frame;
      const sx = ((v.x + 1) / 2) * container.clientWidth;
      const sy = ((1 - v.y) / 2) * container.clientHeight;
      e.el.style.transform = `translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px) translate(-50%, -100%) scale(${Math.max(0.6, Math.min(1, 4 / dist)).toFixed(2)})`;
      e.el.style.display = '';
      if (e.lastText !== text) {
        e.text.textContent = text;
        e.text.style.display = text ? '' : 'none';
        e.lastText = text;
      }
      e.bar.style.display = ratio === null ? 'none' : '';
      if (ratio !== null) e.fill.style.transform = `scaleX(${Math.max(0, Math.min(1, ratio)).toFixed(3)})`;
      if (e.lastTone !== tone) {
        e.el.dataset.tone = tone;
        e.lastTone = tone;
      }
    },
    end() {
      for (const e of pool.values()) if (e.seen !== frame) e.el.style.display = 'none';
    },
    clear() {
      for (const e of pool.values()) e.el.remove();
      pool.clear();
    },
  };
}
