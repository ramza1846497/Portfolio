// 一人称の移動（WASD）と視点（マウス）。当たり判定は collision.js の円と箱。

import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { moveCircle } from '../world/collision.js';
import { PLAYER_OBSTACLES, PLAYER_RADIUS, EYE_HEIGHT } from '../world/store.js';

const SPEED = 3.0;
const dir = new THREE.Vector3();

export function createPlayerControls(camera, dom) {
  const look = new PointerLockControls(camera, dom);
  const keys = { KeyW: false, KeyA: false, KeyS: false, KeyD: false, ArrowUp: false, ArrowLeft: false, ArrowDown: false, ArrowRight: false };
  const pos = { x: 0, z: 0 };
  const forward = { x: 0, z: -1 };

  window.addEventListener('keydown', (e) => {
    if (e.code in keys) keys[e.code] = true;
  });
  window.addEventListener('keyup', (e) => {
    if (e.code in keys) keys[e.code] = false;
  });
  const releaseAll = () => {
    for (const k of Object.keys(keys)) keys[k] = false;
  };
  window.addEventListener('blur', releaseAll);
  look.addEventListener('unlock', releaseAll);

  function reset(spawn) {
    pos.x = spawn.x;
    pos.z = spawn.z;
    camera.position.set(pos.x, EYE_HEIGHT, pos.z);
    camera.rotation.set(0, spawn.yaw ?? 0, 0, 'YXZ');
  }

  function update(dt, active) {
    camera.getWorldDirection(dir);
    const len = Math.hypot(dir.x, dir.z) || 1;
    forward.x = dir.x / len;
    forward.z = dir.z / len;
    if (active) {
      const f = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0);
      const r = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
      if (f || r) {
        let mx = forward.x * f - forward.z * r;
        let mz = forward.z * f + forward.x * r;
        const m = Math.hypot(mx, mz);
        mx = (mx / m) * SPEED * dt;
        mz = (mz / m) * SPEED * dt;
        moveCircle(pos, mx, mz, PLAYER_RADIUS, PLAYER_OBSTACLES);
      }
    }
    camera.position.set(pos.x, EYE_HEIGHT, pos.z);
  }

  return { look, pos, forward, reset, update, releaseAll };
}
