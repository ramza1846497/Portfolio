// 客の生成と行動。位置などの状態だけを扱い、見た目は entityView.js が反映する。

import { PRODUCTS, HOTSNACKS } from '../data/products.js';
import { CUSTOMER_OBSTACLES, CUSTOMER_RADIUS, QUEUE_SLOTS, QUEUE_ENTRIES, SECTION_BY_PRODUCT, WAYPOINTS } from '../world/store.js';
import { planPath } from '../world/waypoints.js';
import { resolveCircle } from '../world/collision.js';
import { takeFromShelf, returnToShelf } from './inventory.js';

export const MAX_CUSTOMERS = 6;
const PICK_TIME = 1.0;
const ARRIVE_EPS = 0.12;
const SEPARATION = 0.62;
const LINE_SEC = 3;
// 進めない時間がこれを超えたら、少しの間ほかの客をすり抜けて抜け出す
const STUCK_SEC = 1.5;
const GHOST_SEC = 1.5;

const OUT = WAYPOINTS.find((w) => w.id === 'out');
const MOVING = new Set(['toShelf', 'toQueue', 'leaving']);

export const PENALTY = Object.freeze({
  missing: 15,
  nothing: 50,
  timeout: 60,
  wrongChange: 30,
  hotSoldout: 15,
});

function say(c, lines, rng) {
  if (!lines || lines.length === 0) return;
  c.line = rng.pick(lines);
  c.lineTimer = LINE_SEC;
}

function setPath(c, path, targetId) {
  c.path = path;
  c.pathIndex = 0;
  c.targetId = targetId;
  c.bestDist = Infinity;
  c.stuck = 0;
}

function goTo(game, c, nodeId) {
  setPath(c, planPath(game.graph, c.x, c.z, nodeId), nodeId);
}

// 列の i 番目へ。すでに列に並んでいて前に詰めるだけなら、まっすぐ進む。
// それ以外は通路側の入口まで行ってから列に入る（列の横をすり抜けない）
function goToSlot(game, c, i) {
  const slot = QUEUE_SLOTS[i];
  const inLine = c.z > QUEUE_ENTRIES[i].z + 0.5 && c.x >= slot.x - 0.2;
  const path = inLine ? [slot] : [...planPath(game.graph, c.x, c.z, QUEUE_ENTRIES[i].id), slot];
  setPath(c, path, slot.id);
}

function pickWants(rng, [lo, hi]) {
  const n = rng.int(lo, hi);
  const pool = PRODUCTS.map((p) => p.id);
  const wants = [];
  while (wants.length < n && pool.length) wants.push(pool.splice(rng.int(0, pool.length - 1), 1)[0]);
  return wants;
}

export function spawnCustomer(game, type) {
  const { state: s, rng } = game;
  const c = {
    id: s.nextCustomerId++,
    typeId: type.id,
    type,
    x: OUT.x + (rng.next() - 0.5) * 0.6,
    z: OUT.z,
    fx: 0,
    fz: -1,
    state: 'toShelf',
    path: [],
    pathIndex: 0,
    targetId: null,
    wants: pickWants(rng, type.wants),
    wantIndex: 0,
    carrying: [],
    hotOrder: rng.next() < type.hotsnackChance ? rng.pick(HOTSNACKS).id : null,
    satisfaction: 100,
    patience: type.patience,
    patienceMax: type.patience,
    timer: 0,
    line: '',
    lineTimer: 0,
    queueIndex: -1,
    inCheckout: false,
    walked: 0,
    bestDist: Infinity,
    stuck: 0,
    ghost: 0,
  };
  say(c, type.lines.enter, rng);
  goTo(game, c, SECTION_BY_PRODUCT[c.wants[0]].pickNode);
  s.customers.push(c);
  return c;
}

// 経路に沿って進む。経路の終わりに着いたら true
function walk(c, dt) {
  let budget = c.type.speed * dt;
  while (c.pathIndex < c.path.length) {
    const p = c.path[c.pathIndex];
    const dx = p.x - c.x;
    const dz = p.z - c.z;
    const d = Math.hypot(dx, dz);
    if (d < ARRIVE_EPS) {
      c.pathIndex += 1;
      c.bestDist = Infinity;
      c.stuck = 0;
      continue;
    }
    // 次の経由点に近づけているか
    if (d < c.bestDist - 0.05) {
      c.bestDist = d;
      c.stuck = 0;
    } else {
      c.stuck += dt;
    }
    if (budget <= 0) return false;
    const step = Math.min(budget, d);
    c.x += (dx / d) * step;
    c.z += (dz / d) * step;
    c.fx = dx / d;
    c.fz = dz / d;
    c.walked += step;
    budget -= step;
    if (step < d) return false;
  }
  return true;
}

function stepToward(c, x, z, dt) {
  const dx = x - c.x;
  const dz = z - c.z;
  const d = Math.hypot(dx, dz);
  if (d < 0.02) return;
  const step = Math.min(c.type.speed * dt, d);
  c.x += (dx / d) * step;
  c.z += (dz / d) * step;
}

function returnItems(game, c) {
  for (const pid of c.carrying) {
    if (!returnToShelf(game.state.inventory, pid)) game.wasteProduct(pid);
  }
  c.carrying = [];
}

export function leave(game, c) {
  c.state = 'leaving';
  goTo(game, c, 'out');
}

function joinQueue(game, c) {
  const q = game.state.queue;
  q.push(c.id);
  c.queueIndex = q.length - 1;
  c.patience = c.patienceMax;
  c.state = 'toQueue';
  say(c, c.type.lines.queue, game.rng);
  goToSlot(game, c, c.queueIndex);
}

export function leaveQueue(game, c) {
  const s = game.state;
  s.queue = s.queue.filter((id) => id !== c.id);
  c.queueIndex = -1;
  s.queue.forEach((id, i) => {
    const other = s.customers.find((x) => x.id === id);
    if (other && other.queueIndex !== i) {
      other.queueIndex = i;
      other.state = 'toQueue';
      goToSlot(game, other, i);
    }
  });
}

function giveUp(game, c) {
  c.satisfaction -= PENALTY.timeout;
  say(c, c.type.lines.angry, game.rng);
  returnItems(game, c);
  leaveQueue(game, c);
  leave(game, c);
  game.emit('toast', { text: `${c.type.name}が待ちきれずに帰りました…`, tone: 'bad' });
}

function nextWant(game, c) {
  c.wantIndex += 1;
  if (c.wantIndex < c.wants.length) {
    c.state = 'toShelf';
    goTo(game, c, SECTION_BY_PRODUCT[c.wants[c.wantIndex]].pickNode);
  } else if (c.carrying.length > 0) {
    joinQueue(game, c);
  } else {
    c.satisfaction -= PENALTY.nothing;
    leave(game, c);
  }
}

function attemptPick(game, c) {
  const pid = c.wants[c.wantIndex];
  if (takeFromShelf(game.state.inventory, pid)) {
    c.carrying.push(pid);
    game.emit('picked', { productId: pid });
    nextWant(game, c);
    return;
  }
  c.satisfaction -= PENALTY.missing;
  say(c, c.type.lines.missing, game.rng);
  if (c.type.leaveOnMissing) {
    returnItems(game, c);
    c.satisfaction -= PENALTY.nothing;
    leave(game, c);
  } else {
    nextWant(game, c);
  }
}

function updateOne(game, c, dt) {
  if (c.lineTimer > 0) c.lineTimer -= dt;
  if (c.ghost > 0) c.ghost -= dt;
  if (MOVING.has(c.state) && c.stuck > STUCK_SEC) {
    c.ghost = GHOST_SEC;
    c.stuck = 0;
    c.bestDist = Infinity;
  }
  switch (c.state) {
    case 'toShelf':
      if (walk(c, dt)) {
        const sec = SECTION_BY_PRODUCT[c.wants[c.wantIndex]];
        c.state = 'picking';
        c.timer = PICK_TIME;
        c.fx = 0;
        c.fz = -sec.dir;
      }
      break;
    case 'picking':
      c.timer -= dt;
      if (c.timer <= 0) attemptPick(game, c);
      break;
    case 'toQueue':
    case 'queued': {
      if (c.state === 'toQueue' && walk(c, dt)) c.state = 'queued';
      if (c.state === 'queued') {
        // 押されてずれたら自分の場所へ戻る
        const slot = QUEUE_SLOTS[c.queueIndex];
        stepToward(c, slot.x, slot.z, dt);
        c.fx = 0;
        c.fz = 1;
      }
      if (!c.inCheckout) {
        c.patience -= dt;
        if (c.patience <= 0) giveUp(game, c);
      }
      break;
    }
    case 'leaving':
      if (walk(c, dt)) c.done = true;
      break;
  }
}

// 客どうしが重ならないように押し合う。歩いている客は右へよけて、正面衝突で止まらないようにする
function separate(customers, dt) {
  for (let i = 0; i < customers.length; i++) {
    for (let j = i + 1; j < customers.length; j++) {
      const a = customers[i];
      const b = customers[j];
      let dx = b.x - a.x;
      let dz = b.z - a.z;
      let d = Math.hypot(dx, dz);
      if (d >= SEPARATION) continue;
      if (d < 1e-6) {
        dx = a.id < b.id ? 1 : -1;
        dz = 0;
        d = 1;
      }
      const nx = dx / d;
      const nz = dz / d;
      const overlap = SEPARATION - d;
      // すり抜け中の客とは押し合わない
      if (a.ghost > 0 || b.ghost > 0) continue;
      const wa = MOVING.has(a.state) ? 1 : 0.15;
      const wb = MOVING.has(b.state) ? 1 : 0.15;
      const sum = wa + wb;
      const push = Math.min(overlap, 2.5 * dt + overlap * 0.5);
      a.x -= nx * push * (wa / sum);
      a.z -= nz * push * (wa / sum);
      b.x += nx * push * (wb / sum);
      b.z += nz * push * (wb / sum);
      sidestep(a, nx, nz, wa, dt);
      sidestep(b, -nx, -nz, wb, dt);
    }
  }
}

// 相手が進行方向の前にいたら横によける。相手が少しでも左右にずれていればその反対側へ、真正面なら右へ
function sidestep(self, ox, oz, weight, dt) {
  if (weight < 1 || self.fx * ox + self.fz * oz <= 0.3) return;
  const rx = -self.fz;
  const rz = self.fx;
  const side = rx * ox + rz * oz;
  const sign = side > 0.15 ? -1 : 1;
  self.x += rx * sign * 1.2 * dt;
  self.z += rz * sign * 1.2 * dt;
}

const tmp = { x: 0, z: 0 };

export function updateCustomers(game, dt) {
  const s = game.state;
  for (const c of s.customers) updateOne(game, c, dt);
  separate(s.customers, dt);
  for (const c of s.customers) {
    tmp.x = c.x;
    tmp.z = c.z;
    resolveCircle(tmp, CUSTOMER_RADIUS, CUSTOMER_OBSTACLES);
    c.x = tmp.x;
    c.z = tmp.z;
  }
  if (s.customers.some((c) => c.done)) {
    for (const c of s.customers) if (c.done) game.customerExited(c);
    s.customers = s.customers.filter((c) => !c.done);
  }
}

export function queueHead(s) {
  const c = s.customers.find((x) => x.id === s.queue[0]);
  return c && c.state === 'queued' && c.queueIndex === 0 ? c : null;
}

export function customerById(s, id) {
  return s.customers.find((c) => c.id === id) ?? null;
}

export function sayLine(game, c, key) {
  say(c, c.type.lines[key], game.rng);
}
