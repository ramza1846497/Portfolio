// 客の移動経路。経由点どうしを「障害物に当たらずにまっすぐ行けるか」で自動的につなぎ、最短経路をたどる。

import { inflate, segmentClear } from './collision.js';
import { WAYPOINTS, CUSTOMER_OBSTACLES, CUSTOMER_RADIUS } from './store.js';

export function buildGraph(nodes, obstacles, pad) {
  const padded = obstacles.map((b) => inflate(b, pad));
  const index = new Map(nodes.map((n, i) => [n.id, i]));
  const adj = nodes.map(() => []);
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i];
      const b = nodes[j];
      if (segmentClear(a.x, a.z, b.x, b.z, padded)) {
        const d = Math.hypot(a.x - b.x, a.z - b.z);
        adj[i].push({ to: j, d });
        adj[j].push({ to: i, d });
      }
    }
  }
  return { nodes, index, adj, padded, toTarget: new Map() };
}

// target への最短距離と「次に行く点」を全点について求める（目的地ごとにキャッシュ）
function towards(graph, targetId) {
  let entry = graph.toTarget.get(targetId);
  if (entry) return entry;
  const n = graph.nodes.length;
  const dist = new Array(n).fill(Infinity);
  const next = new Array(n).fill(-1);
  const done = new Array(n).fill(false);
  const t = graph.index.get(targetId);
  dist[t] = 0;
  for (;;) {
    let u = -1;
    for (let i = 0; i < n; i++) if (!done[i] && dist[i] < Infinity && (u === -1 || dist[i] < dist[u])) u = i;
    if (u === -1) break;
    done[u] = true;
    for (const { to, d } of graph.adj[u]) {
      if (dist[u] + d < dist[to]) {
        dist[to] = dist[u] + d;
        next[to] = u;
      }
    }
  }
  entry = { dist, next };
  graph.toTarget.set(targetId, entry);
  return entry;
}

// いまの位置から targetId までの経由点の列（座標の配列）
export function planPath(graph, x, z, targetId) {
  const { dist, next } = towards(graph, targetId);
  let best = -1;
  let bestCost = Infinity;
  for (let i = 0; i < graph.nodes.length; i++) {
    const node = graph.nodes[i];
    if (dist[i] === Infinity) continue;
    const cost = Math.hypot(node.x - x, node.z - z) + dist[i];
    if (cost < bestCost && segmentClear(x, z, node.x, node.z, graph.padded)) {
      best = i;
      bestCost = cost;
    }
  }
  if (best === -1) {
    // 見通せる点がない（押されてずれた等）：いちばん近い点から
    for (let i = 0; i < graph.nodes.length; i++) {
      const cost = Math.hypot(graph.nodes[i].x - x, graph.nodes[i].z - z);
      if (dist[i] < Infinity && cost < bestCost) {
        best = i;
        bestCost = cost;
      }
    }
  }
  const path = [];
  for (let i = best; i !== -1; i = next[i]) path.push(graph.nodes[i]);
  return path;
}

export function createStoreGraph() {
  // 見通し判定は客の半径より少し広めに取って、角をこすらないようにする
  return buildGraph(WAYPOINTS, CUSTOMER_OBSTACLES, CUSTOMER_RADIUS + 0.05);
}
