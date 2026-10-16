// 動く物の見た目。毎フレーム game.state を読んでメッシュに反映するだけで、状態は変更しない。

import * as THREE from 'three';
import { mat } from './storeView.js';
import { PRODUCT_BY_ID, SNACK_BY_ID, HOTSNACKS } from '../data/products.js';
import { SHELF_SECTIONS, SHELF_CAPACITY, RACK_SLOTS, DOOR, HOTCASE_POS, FRYER_POS, EYE_HEIGHT } from './store.js';
import { caseCount, CASE_CAP_PER_SNACK } from '../systems/hotsnack.js';

const POP_SEC = 0.25;
const dummy = new THREE.Object3D();
const proxyMaterial = new THREE.MeshBasicMaterial({ visible: false });

function itemGeometry(category) {
  if (category === '飲料') return new THREE.CylinderGeometry(0.05, 0.06, 0.26, 10).translate(0, 0.13, 0);
  if (category === 'おにぎり') return new THREE.CylinderGeometry(0.11, 0.11, 0.05, 3).rotateX(Math.PI / 2).rotateZ(Math.PI / 2).translate(0, 0.09, 0);
  if (category === 'パン') return new THREE.SphereGeometry(0.09, 10, 8).scale(1, 0.7, 1).translate(0, 0.06, 0);
  return new THREE.BoxGeometry(0.16, 0.2, 0.08).translate(0, 0.1, 0);
}

const easeOutBack = (t) => 1 + 2.7 * (t - 1) ** 3 + 1.7 * (t - 1) ** 2;

// 何度も作る物の形は使い回す（客や段ボールが増減してもメモリが増えないように）
const GEO = {
  boxBody: new THREE.BoxGeometry(0.45, 0.4, 0.45),
  boxLabel: new THREE.BoxGeometry(0.3, 0.14, 0.01),
  boxTape: new THREE.BoxGeometry(0.08, 0.005, 0.46),
  body: new THREE.CapsuleGeometry(0.22, 0.75, 4, 12),
  head: new THREE.SphereGeometry(0.17, 14, 10),
  nose: new THREE.BoxGeometry(0.06, 0.04, 0.04),
  basket: new THREE.BoxGeometry(0.3, 0.16, 0.2),
};

function cardboardMesh(productId) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(GEO.boxBody, mat(0xc49a6c));
  g.add(body);
  const label = new THREE.Mesh(GEO.boxLabel, mat(PRODUCT_BY_ID[productId].color));
  label.position.set(0, 0.04, 0.226);
  g.add(label);
  const tape = new THREE.Mesh(GEO.boxTape, mat(0xe0c08a));
  tape.position.y = 0.2;
  g.add(tape);
  return { group: g, body };
}

function mopMesh() {
  const g = new THREE.Group();
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.3, 8), mat(0xd8d2c4));
  stick.position.y = 0.7;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.06, 0.12), mat(0x5aa0d8));
  head.position.y = 0.04;
  g.add(stick, head);
  return g;
}

function customerMesh(type) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(GEO.body, mat(type.color));
  body.position.y = 0.6;
  const head = new THREE.Mesh(GEO.head, mat(0xf1c9a5));
  head.position.y = 1.38;
  const nose = new THREE.Mesh(GEO.nose, mat(0xe2b08a));
  nose.position.set(0, 1.37, 0.17);
  const basket = new THREE.Mesh(GEO.basket, mat(0xf08a24));
  basket.position.set(0, 0.75, 0.3);
  g.add(body, head, nose, basket);
  return { group: g, basket };
}

export function createEntityView(scene, camera, storeParts) {
  const root = new THREE.Group();
  scene.add(root);
  const targets = []; // 動く物のうち、クリックできるもの
  let targetsDirty = true;

  // ---- 棚の商品（商品ごとに InstancedMesh） ----
  const shelves = SHELF_SECTIONS.map((sec) => {
    const p = PRODUCT_BY_ID[sec.productId];
    const mesh = new THREE.InstancedMesh(itemGeometry(p.category), mat(p.color), SHELF_CAPACITY);
    mesh.count = 0;
    // 個数が変わるたびに境界を計算し直さなくて済むよう、視錐台カリングはしない（数が少ないので軽い）
    mesh.frustumCulled = false;
    root.add(mesh);
    return { sec, mesh, shown: -1, popIndex: -1, popT: 0 };
  });

  function setSlot(entry, i, scale) {
    const slot = entry.sec.slots[i];
    dummy.position.set(slot.x, slot.y - 0.08, slot.z);
    dummy.rotation.set(0, entry.sec.dir > 0 ? 0 : Math.PI, 0);
    dummy.scale.setScalar(scale);
    dummy.updateMatrix();
    entry.mesh.setMatrixAt(i, dummy.matrix);
  }

  function syncShelves(s, dt) {
    for (const e of shelves) {
      const n = s.inventory.shelves[e.sec.productId] ?? 0;
      if (n !== e.shown) {
        if (n === e.shown + 1 && e.shown >= 0) {
          e.popIndex = n - 1;
          e.popT = 0;
        }
        for (let i = 0; i < n; i++) setSlot(e, i, 1);
        e.mesh.count = n;
        e.shown = n;
        e.mesh.instanceMatrix.needsUpdate = true;
      }
      if (e.popIndex >= 0) {
        e.popT += dt;
        const t = Math.min(1, e.popT / POP_SEC);
        if (e.popIndex < n) setSlot(e, e.popIndex, Math.max(0.01, easeOutBack(t)));
        e.mesh.instanceMatrix.needsUpdate = true;
        if (t >= 1) e.popIndex = -1;
      }
    }
  }

  // ---- 段ボール ----
  const boxes = new Map();
  function syncBoxes(s) {
    for (const b of s.inventory.boxes) {
      let v = boxes.get(b.id);
      if (!v) {
        v = cardboardMesh(b.productId);
        v.body.userData.target = { type: 'box', id: b.id };
        boxes.set(b.id, v);
        root.add(v.group);
        targetsDirty = true;
      }
      v.seen = true;
      const visible = b.where !== 'hand';
      if (v.group.visible !== visible) {
        v.group.visible = visible;
        targetsDirty = true;
      }
      if (b.where === 'rack') {
        const slot = RACK_SLOTS[b.slot];
        v.group.position.set(slot.x, slot.y, slot.z);
      } else if (b.where === 'floor') {
        v.group.position.set(b.x, 0.2, b.z);
      }
      v.group.scale.y = b.count === 0 ? 0.35 : 1;
    }
    for (const [id, v] of boxes) {
      if (!v.seen) {
        root.remove(v.group);
        boxes.delete(id);
        targetsDirty = true;
      }
      v.seen = false;
    }
  }

  // ---- モップ ----
  const mop = mopMesh();
  const mopProxy = new THREE.Mesh(new THREE.BoxGeometry(0.45, 1.4, 0.45), proxyMaterial);
  mopProxy.position.y = 0.7;
  mopProxy.userData.target = { type: 'mop' };
  mop.add(mopProxy);
  root.add(mop);

  // ---- 汚れ ----
  const dirtGeo = new THREE.CircleGeometry(0.38, 20).rotateX(-Math.PI / 2);
  const dirtMat = new THREE.MeshLambertMaterial({ color: 0x9a7a3a, transparent: true, opacity: 0.85 });
  const dirts = new Map();
  function syncDirt(s) {
    for (const d of s.cleaning.dirt) {
      let m = dirts.get(d.id);
      if (!m) {
        m = new THREE.Mesh(dirtGeo, dirtMat);
        m.position.set(d.x, 0.006, d.z);
        m.scale.set(1.1, 1, 0.8);
        m.userData.target = { type: 'dirt', id: d.id };
        root.add(m);
        dirts.set(d.id, m);
        targetsDirty = true;
      }
      m.userData.seen = true;
      const k = 1 - d.wipes * 0.25;
      m.scale.set(1.1 * k, 1, 0.8 * k);
    }
    for (const [id, m] of dirts) {
      if (!m.userData.seen) {
        root.remove(m);
        dirts.delete(id);
        targetsDirty = true;
      }
      m.userData.seen = false;
    }
  }

  // ---- 客 ----
  const customers = new Map();
  function syncCustomers(s) {
    for (const c of s.customers) {
      let v = customers.get(c.id);
      if (!v) {
        v = customerMesh(c.type);
        customers.set(c.id, v);
        root.add(v.group);
      }
      v.seen = true;
      v.group.position.set(c.x, 0, c.z);
      v.group.rotation.y = Math.atan2(c.fx, c.fz);
      v.group.visible = c.z < 6.8;
      v.basket.visible = c.carrying.length > 0;
    }
    for (const [id, v] of customers) {
      if (!v.seen) {
        root.remove(v.group);
        customers.delete(id);
      }
      v.seen = false;
    }
  }

  // ---- ホットケースの中身 ----
  const caseItems = HOTSNACKS.map((snack, row) => {
    const geo = snack.id === 'potato' ? new THREE.BoxGeometry(0.08, 0.1, 0.05) : new THREE.SphereGeometry(0.045, 8, 6).scale(1.3, 0.8, 1);
    const mesh = new THREE.InstancedMesh(geo, mat(snack.color), CASE_CAP_PER_SNACK);
    mesh.frustumCulled = false;
    for (let i = 0; i < CASE_CAP_PER_SNACK; i++) {
      dummy.position.set(HOTCASE_POS.x - 0.4 + i * 0.11, HOTCASE_POS.y + 0.1 + (row === 2 ? 0.25 : 0), HOTCASE_POS.z - 0.12 + (row % 2) * 0.22);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.count = 0;
    root.add(mesh);
    return { snack, mesh };
  });

  // ---- 手に持っている物（カメラに付ける） ----
  const held = new THREE.Group();
  held.position.set(0.18, -0.38, -0.6);
  camera.add(held);
  const heldBoxes = new Map();
  const heldMop = mopMesh();
  heldMop.rotation.set(-0.9, 0, 0.2);
  heldMop.position.set(0.1, -0.3, 0.1);
  heldMop.scale.setScalar(0.7);
  held.add(heldMop);
  const tray = new THREE.Group();
  tray.add(new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.03, 0.24), mat(0xd9d9d9)));
  const nuggets = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), mat(0xc7772c));
  for (let i = 0; i < 4; i++) {
    const n = nuggets.clone();
    n.position.set(-0.11 + i * 0.075, 0.04, 0);
    tray.add(n);
  }
  held.add(tray);
  let lastHeldKey = '-';

  function syncHeld(s, game) {
    const h = s.hand;
    const box = game.heldBox();
    const key = h ? `${h.kind}:${box?.productId ?? h.snackId ?? ''}` : '';
    if (key !== lastHeldKey) {
      lastHeldKey = key;
      for (const v of heldBoxes.values()) v.group.visible = false;
      heldMop.visible = h?.kind === 'mop';
      tray.visible = h?.kind === 'fried';
      if (box) {
        let v = heldBoxes.get(box.productId);
        if (!v) {
          v = cardboardMesh(box.productId);
          v.group.scale.setScalar(0.8);
          heldBoxes.set(box.productId, v);
          held.add(v.group);
        }
        v.group.visible = true;
      }
      if (h?.kind === 'fried') for (const n of tray.children.slice(1)) n.material = mat(SNACK_BY_ID[h.snackId].color);
    }
  }

  // ---- フライヤーの油の色 ----
  const oilColors = { idle: 0x8a6a1f, frying: 0xc99a2e, done: 0xe0b040, burnt: 0x3a2412 };
  let bob = 0;
  let lastFryerState = '';

  function update(s, game, dt) {
    syncShelves(s, dt);
    syncBoxes(s);
    syncDirt(s);
    syncCustomers(s);
    syncHeld(s, game);
    const mopVisible = s.mop.where !== 'hand';
    if (mop.visible !== mopVisible) {
      mop.visible = mopVisible;
      targetsDirty = true;
    }
    if (s.mop.where === 'stand') {
      mop.position.set(s.mop.x, 0.15, s.mop.z);
      mop.rotation.set(0, 0, 0.15);
    } else {
      mop.position.set(s.mop.x, 0, s.mop.z);
      mop.rotation.set(0, 0, 1.45);
    }
    for (const { snack, mesh } of caseItems) mesh.count = caseCount(s.hotCase, snack.id);
    const f = s.fryer;
    if (f.state !== lastFryerState) {
      lastFryerState = f.state;
      storeParts.oil.material = mat(oilColors[f.state]);
    }
    bob += dt;
    storeParts.oil.position.y = FRYER_POS.y + 0.005 + (f.state === 'frying' ? Math.sin(bob * 25) * 0.004 : 0);
    const open = s.door * (DOOR.width / 2 - 0.05);
    storeParts.door.left.position.x = DOOR.x - DOOR.width / 4 - open;
    storeParts.door.right.position.x = DOOR.x + DOOR.width / 4 + open;
  }

  // 客とフライヤーの上のラベル
  function labels(layer, s) {
    for (const c of s.customers) {
      if (c.z > 6.5) continue;
      const inQueue = c.state === 'toQueue' || c.state === 'queued';
      const ratio = inQueue && !c.inCheckout ? c.patience / c.patienceMax : null;
      const tone = ratio !== null && ratio < 0.3 ? 'bad' : c.satisfaction < 60 ? 'warn' : '';
      layer.place(`c${c.id}`, c.x, 1.95, c.z, camera, { text: c.lineTimer > 0 ? c.line : '', ratio, tone });
    }
    const f = s.fryer;
    if (f.state !== 'idle') {
      const name = SNACK_BY_ID[f.snackId].name;
      const info = {
        frying: { text: `${name} 揚げ中`, ratio: f.t / f.fryTime, tone: '' },
        done: { text: `${name} 揚がった！あと${Math.ceil(10 - f.t)}秒`, ratio: 1 - f.t / 10, tone: 'good' },
        burnt: { text: '焦げた…', ratio: null, tone: 'bad' },
      }[f.state];
      layer.place('fryer', FRYER_POS.x, FRYER_POS.y + 0.7, FRYER_POS.z, camera, info);
    }
  }

  function raycastTargets(staticList) {
    if (targetsDirty) {
      targets.length = 0;
      targets.push(...staticList);
      for (const v of boxes.values()) if (v.group.visible) targets.push(v.body);
      for (const m of dirts.values()) targets.push(m);
      if (mop.visible) targets.push(mopProxy);
      targetsDirty = false;
    }
    return targets;
  }

  function reset() {
    for (const v of boxes.values()) root.remove(v.group);
    boxes.clear();
    for (const m of dirts.values()) root.remove(m);
    dirts.clear();
    for (const v of customers.values()) root.remove(v.group);
    customers.clear();
    for (const e of shelves) e.shown = -1;
    lastHeldKey = '-';
    targetsDirty = true;
  }

  return { update, labels, raycastTargets, reset, eyeHeight: EYE_HEIGHT };
}
