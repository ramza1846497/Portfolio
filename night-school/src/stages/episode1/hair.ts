import * as THREE from 'three';
import type { Human } from '../../world/human';

/*
 * 髪：細い毛を何百本も描いた半透明の絵（ヘアカード）を、少ない枚数の細長い板に貼る。
 * 板は頭皮から垂れる鎖として毎フレーム動かし（重さで垂れ、揺れが残る）、
 * 頭・首・胸・肩・腕にめり込まないよう押し出す。髪型は「休みの形」へ引き戻す強さで保つ。
 */

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let strandTex: THREE.Texture | null = null;

/** 細い毛の束の絵：根もとは濃く、毛先は細くまばらに透ける */
function strandTexture(): THREE.Texture {
  if (strandTex) return strandTex;
  const W = 128;
  const H = 512;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d')!;
  const rand = rng(7);
  ctx.clearRect(0, 0, W, H);
  // 下地：細い毛を密に並べた面（縮小しても透けすぎないように）。毛先は一本ずつ長さがばらばら
  for (let x = 0; x < W; x++) {
    const end = H * (0.7 + rand() * 0.3);
    const edge = Math.min(1, Math.min(x, W - 1 - x) / 3 + 0.35);
    const shade = Math.floor(120 + rand() * 60);
    const g = ctx.createLinearGradient(0, 0, 0, end);
    g.addColorStop(0, `rgba(${shade},${shade},${shade},${0.95 * edge})`);
    g.addColorStop(0.85, `rgba(${shade},${shade},${shade},${0.85 * edge})`);
    g.addColorStop(1, `rgba(${shade},${shade},${shade},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(x, 0, 1, end);
  }
  // 上に、明るい毛と暗い毛の筋（つや・束の流れ）
  for (let i = 0; i < 220; i++) {
    const x0 = rand() * W;
    const end = H * (0.6 + rand() * 0.4);
    const light = rand() < 0.5;
    const v = light ? 230 : 40;
    ctx.strokeStyle = `rgba(${v},${v},${v},${0.25 + rand() * 0.35})`;
    ctx.lineWidth = 0.5 + rand();
    ctx.beginPath();
    ctx.moveTo(x0, 0);
    const wave = (rand() - 0.5) * 8;
    const ph = rand() * 6;
    for (let y = 8; y <= end; y += 8) ctx.lineTo(x0 + Math.sin(y * 0.02 + ph) * wave * (y / H), y);
    ctx.stroke();
  }
  strandTex = new THREE.CanvasTexture(c);
  strandTex.colorSpace = THREE.SRGBColorSpace;
  strandTex.anisotropy = 4;
  // 縮小用の絵を作ると、透明な部分が混ざって遠目で髪が薄く消えてしまうので作らない
  strandTex.generateMipmaps = false;
  strandTex.minFilter = THREE.LinearFilter;
  return strandTex;
}

/** 髪の材質（color で髪の色）。透明の所は抜く */
export function hairMaterial(color: number, opacity = 1): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    map: strandTexture(),
    color,
    roughness: 0.55,
    metalness: 0,
    side: THREE.DoubleSide,
    alphaTest: 0.3,
    transparent: opacity < 1,
    opacity,
    depthWrite: true,
  });
}

export interface HairStyle {
  /** 板の枚数 */
  cards: number;
  /** 板の幅（m、頭の大きさ 1 のとき） */
  width: number;
  /** 角度 θ（0 が正面）ごとの長さ（m） */
  len: (theta: number) => number;
  /** 角度ごとの毛先の高さ（頭の骨の座標の y）。ここで切りそろえる */
  cut?: (theta: number) => number;
  /** 分け目：この角度の範囲には生やさない */
  part?: [number, number];
  /** 分け目の中に、顔の前へ垂れる細い毛束を何本足すか */
  faceStrands?: number;
  /** 根もとの何点を髪型どおりに保つか（大きいほど髪型が崩れない。長い黒髪は 2、おかっぱは 4 くらい） */
  rootHold?: number;
  /** 頭の動きをどれだけ髪に残すか（0〜1。1 で完全に取り残される、0 で頭といっしょに動く） */
  inertia?: number;
  /** 動かさない（短い髪・おかっぱ）：頭に固定した形で一度だけ作る。計算がいらず軽い */
  fixed?: boolean;
  /** 髪型へ戻るばねの強さ（根もとの値、1/秒）。毛先へ行くほど弱くなる */
  stiff: number;
  /** ばねの弱まり方（大きいほど毛先が自由に揺れる。おかっぱ 0.7、長い髪 3） */
  falloff?: number;
  seed: number;
}

interface Card {
  /** 頭の骨の座標での、休みの形の点 */
  rest: THREE.Vector3[];
  pos: THREE.Vector3[];
  prev: THREE.Vector3[];
  seg: number;
  width: number;
}

const NODES = 8;

/**
 * 髪を付ける。返す mesh は figure（体の入れ物の親）に入れる。毎フレーム自分で動く（描く直前）。
 * colliders は体の骨から作る（頭・首・胸・肩・腕）
 */
export function attachCardHair(h: Human, figure: THREE.Object3D, mat: THREE.Material, style: HairStyle): THREE.Mesh {
  const rand = rng(style.seed);
  const c = h.skull.center;
  const r = h.skull.radius * 1.03;
  const cards: Card[] = [];
  const extra = style.part ? (style.faceStrands ?? 0) : 0;
  for (let i = 0; i < style.cards * 3 && cards.length < style.cards + extra; i++) {
    const strand = cards.length >= style.cards;
    let theta = rand() * Math.PI * 2;
    if (strand && style.part) theta = style.part[0] + rand() * (style.part[1] - style.part[0]);
    const signed = theta > Math.PI ? theta - Math.PI * 2 : theta;
    if (!strand && style.part && signed > style.part[0] && signed < style.part[1]) continue;
    const front = THREE.MathUtils.smoothstep(Math.cos(theta), 0.2, 0.75);
    const maxPolar = 1.3 - 0.4 * front;
    const polar = Math.acos(1 - rand() * (1 - Math.cos(maxPolar)));
    const hx = Math.sin(theta);
    const hz = Math.cos(theta);
    const p = c.clone().add(new THREE.Vector3(Math.sin(polar) * hx, Math.cos(polar), Math.sin(polar) * hz).multiplyScalar(r * 0.97));
    let dir = new THREE.Vector3(Math.cos(polar) * hx, -Math.sin(polar), Math.cos(polar) * hz).normalize();
    const L = style.len(theta) * (0.9 + rand() * 0.2);
    const cut = style.cut ? style.cut(theta) + (rand() - 0.5) * 0.006 : -Infinity;
    // 頭の丸みに沿って垂らした形（休みの形）
    const pts: THREE.Vector3[] = [p.clone()];
    const step = L / (NODES - 1);
    const q = p.clone();
    for (let k = 1; k < NODES; k++) {
      q.addScaledVector(dir, step);
      const v = q.clone().sub(c);
      if (v.length() < r * 1.05) q.copy(c).addScaledVector(v.normalize(), r * 1.05);
      if (q.y < cut) q.y = cut;
      pts.push(q.clone());
      dir = dir.lerp(new THREE.Vector3(hx * 0.03, -1, hz * 0.03), 0.6).normalize();
    }
    // 毛先を切りそろえた場合は、点の間隔を詰めて長さをそろえる
    let len = 0;
    for (let k = 1; k < NODES; k++) len += pts[k].distanceTo(pts[k - 1]);
    const w = style.width * (strand ? 0.28 : 0.8 + rand() * 0.4) * (h.skull.radius / 0.1);
    cards.push({ rest: pts, pos: pts.map((v) => v.clone()), prev: pts.map((v) => v.clone()), seg: Math.max(len / (NODES - 1), 0.002), width: w });
  }

  const count = cards.length * NODES * 2;
  const position = new Float32Array(count * 3);
  const normal = new Float32Array(count * 3);
  const uv = new Float32Array(count * 2);
  const index: number[] = [];
  cards.forEach((_, ci) => {
    const u0 = (ci % 4) * 0.25;
    for (let k = 0; k < NODES; k++) {
      const base = (ci * NODES + k) * 2;
      // 絵の上（v=1）が根もと
      uv.set([u0, 1 - k / (NODES - 1), u0 + 0.25, 1 - k / (NODES - 1)], base * 2);
      if (k < NODES - 1) index.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
    }
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(position, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(index);
  const mesh = new THREE.Mesh(geo, mat);
  if (style.fixed) {
    // 頭の骨の座標で、髪型どおりの板を一度だけ作って頭に付ける
    const c0 = c;
    let vi = 0;
    const tmp = new THREE.Vector3();
    const side = new THREE.Vector3();
    const out = new THREE.Vector3();
    const along = new THREE.Vector3();
    for (const card of cards) {
      for (let n = 0; n < NODES; n++) {
        const p = card.rest[n];
        along.copy(card.rest[Math.min(n + 1, NODES - 1)]).sub(card.rest[Math.max(n - 1, 0)]).normalize();
        out.copy(p).sub(c0);
        out.y = 0;
        out.normalize();
        side.copy(along).cross(out).normalize();
        const w = card.width * (1 - 0.35 * (n / (NODES - 1)));
        for (const sg of [-0.5, 0.5]) {
          tmp.copy(p).addScaledVector(side, w * sg);
          position.set([tmp.x, tmp.y, tmp.z], vi * 3);
          normal.set([out.x, 0.3, out.z], vi * 3);
          vi++;
        }
      }
    }
    geo.computeBoundingSphere();
    h.bones.head.add(mesh);
    return mesh;
  }
  // 画面の外なら描かない（動かしもしない）。境界は人物全体を覆う大きさ
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1, 0), 1.4);
  figure.add(mesh);

  // 当たり判定（骨の付け根を結ぶカプセル。半径は体つきに合わせる）
  const k = h.height / 1.25;
  const caps: [string, string, number][] = [
    ['neck', 'head', 0.035 * k],
    ['spine', 'neck', 0.1 * k],
    ['clavicle_L', 'upperarm_L', 0.045 * k],
    ['clavicle_R', 'upperarm_R', 0.045 * k],
    ['upperarm_L', 'lowerarm_L', 0.032 * k],
    ['upperarm_R', 'lowerarm_R', 0.032 * k],
  ];
  const capA = caps.map(() => new THREE.Vector3());
  const capB = caps.map(() => new THREE.Vector3());
  const head = h.bones.head;
  const tmp = new THREE.Vector3();
  const A = new THREE.Vector3();
  const B = new THREE.Vector3();
  const C = new THREE.Vector3();
  const D = new THREE.Vector3();
  const skullW = new THREE.Vector3();
  const inv = new THREE.Matrix4();
  let last = -1;
  const scaleW = new THREE.Vector3();
  const lastRoot = new THREE.Vector3(1e9, 0, 0);

  const hold = Math.max(1, style.rootHold ?? 2);
  const inertia = style.inertia ?? 0.7;
  // 曲がりにくさ：一つおきの点の間の、休みの形での距離（これより縮むと曲がりすぎ）
  const bend = cards.map((card) => card.rest.map((v, n) => (n >= 2 ? v.distanceTo(card.rest[n - 2]) : 0)));
  // 区間ごとの長さ（切りそろえた毛先は短い）
  const segs = cards.map((card) => card.rest.map((v, n) => (n >= 1 ? Math.max(v.distanceTo(card.rest[n - 1]), 0.001) : 0)));
  // 髪型へ戻るばね：点ごとの強さ（1 コマあたりの割合）
  const falloff = style.falloff ?? 1;
  const pull = Array.from({ length: NODES }, (_, n) => 1 - Math.exp(-style.stiff * Math.pow(1 - n / NODES, falloff) * (1 / 60)));
  // 毛束ごとの、空気のゆらぎの位相
  const phase = cards.map(() => rand() * 100);
  const STEP = 1 / 60;
  let acc = 0;
  let time = 0;

  /** 1 コマ（1/60 秒）ぶん進める */
  const substep = (s: number, move: THREE.Vector3) => {
    const dt = STEP;
    time += dt;
    const gravity = 9.8 * dt * dt;
    // 頭の移動の一部は髪ごと動かす（残りは慣性として、髪が遅れて付いてくる）
    tmp.copy(move).multiplyScalar(1 - inertia);
    cards.forEach((card, ci) => {
      // 根もと側は頭皮に付いたまま、髪型どおりに（毛先へ行くほど自由）
      for (let n = 0; n < hold; n++) {
        card.pos[n].copy(card.rest[n]).applyMatrix4(head.matrixWorld);
        card.prev[n].copy(card.pos[n]);
      }
      const sway = 0.00004 * Math.sin(time * 1.3 + phase[ci]);
      for (let n = hold; n < NODES; n++) {
        const p = card.pos[n];
        const pv = card.prev[n];
        p.add(tmp);
        pv.add(tmp);
        // 慣性（空気の抵抗で少しずつ弱まる）と重さ
        A.copy(p).sub(pv).multiplyScalar(0.982);
        pv.copy(p);
        p.add(A);
        p.y -= gravity;
        p.x += sway * n;
        // 髪型（頭の向きに付いてくる形）へ、ばねで戻す
        if (pull[n] > 1e-4) p.lerp(B.copy(card.rest[n]).applyMatrix4(head.matrixWorld), pull[n]);
      }
    });
    for (let it = 0; it < 3; it++) {
      for (let ci = 0; ci < cards.length; ci++) {
        const card = cards[ci];
        for (let n = hold; n < NODES; n++) {
          const a = card.pos[n - 1];
          const p = card.pos[n];
          // 長さを保つ（根もと側は動かさず、先の点を引き寄せる）
          B.copy(p).sub(a);
          const d = B.length() || 1e-6;
          p.copy(a).addScaledVector(B, (segs[ci][n] * s) / d);
          // 曲がりにくさ：二つ前の点から近づきすぎたら離す（毛束がまっすぐ流れる）
          if (n >= 2) {
            const a2 = card.pos[n - 2];
            B.copy(p).sub(a2);
            const d2 = B.length() || 1e-6;
            const want = bend[ci][n] * s * 0.92;
            if (d2 < want) p.addScaledVector(B, ((want - d2) / d2) * 0.5);
          }
          // 頭からはみ出させる
          B.copy(p).sub(skullW);
          const rr = r * 1.04 * s;
          const dh = B.length();
          if (dh < rr) p.copy(skullW).addScaledVector(B.divideScalar(dh || 1), rr);
          // 体のカプセルから押し出し、表面ですべらせる（肩にかかって流れる）
          for (let k = 0; k < caps.length; k++) {
            A.copy(capA[k]);
            B.copy(capB[k]).sub(A);
            const t = Math.min(1, Math.max(0, C.copy(p).sub(A).dot(B) / Math.max(B.lengthSq(), 1e-9)));
            A.addScaledVector(B, t);
            C.copy(p).sub(A);
            const R = caps[k][2] * s + 0.012;
            const dd = C.length();
            if (dd < R) {
              p.copy(A).addScaledVector(dd > 1e-6 ? C.divideScalar(dd) : C.set(0, 0, 1), R);
              // 摩擦：当たっている間は、動きを少し止める
              card.prev[n].lerp(p, 0.3);
            }
          }
        }
      }
    }
  };

  const reset = () => {
    // 髪型の形から、重さで垂れた形まで落ち着かせる
    for (const card of cards) {
      for (let n = 0; n < NODES; n++) {
        card.pos[n].copy(card.rest[n]).applyMatrix4(head.matrixWorld);
        card.prev[n].copy(card.pos[n]);
      }
    }
    const zero = new THREE.Vector3();
    for (let i = 0; i < 40; i++) substep(scaleW.x, zero);
  };

  const update = () => {
    const now = performance.now() / 1000;
    // 長く止まっていた（画面の外・遠く）後は、落ち着いた形から始め直す
    const stale = last < 0 || now - last > 0.3;
    const dt = stale ? 0 : now - last;
    last = now;
    figure.updateWorldMatrix(true, true);
    head.getWorldScale(scaleW);
    const s = scaleW.x;
    skullW.copy(c).applyMatrix4(head.matrixWorld);
    for (let i = 0; i < caps.length; i++) {
      h.bones[caps[i][0]].getWorldPosition(capA[i]);
      h.bones[caps[i][1]].getWorldPosition(capB[i]);
    }
    if (stale || skullW.distanceTo(lastRoot) > 0.6) {
      lastRoot.copy(skullW);
      reset();
      acc = 0;
    } else {
      // 決まった刻み（1/60 秒）で進める。頭の移動は刻みの数で割って渡す
      acc = Math.min(acc + dt, STEP * 4);
      const n = Math.floor(acc / STEP);
      const move = D.copy(skullW).sub(lastRoot).divideScalar(Math.max(n, 1));
      for (let i = 0; i < n; i++) substep(s, move);
      acc -= n * STEP;
      if (n > 0) lastRoot.copy(skullW);
    }
    // 板の形を作る（入れ物の座標で）
    inv.copy(figure.matrixWorld).invert();
    let vi = 0;
    const side = new THREE.Vector3();
    const out = new THREE.Vector3();
    const along = new THREE.Vector3();
    for (const card of cards) {
      for (let n = 0; n < NODES; n++) {
        const p = card.pos[n];
        along.copy(card.pos[Math.min(n + 1, NODES - 1)]).sub(card.pos[Math.max(n - 1, 0)]).normalize();
        out.copy(p).sub(skullW);
        out.y *= 0.3;
        out.normalize();
        side.copy(along).cross(out).normalize();
        const w = card.width * s * (1 - 0.35 * (n / (NODES - 1)));
        for (const sg of [-0.5, 0.5]) {
          tmp.copy(p).addScaledVector(side, w * sg).applyMatrix4(inv);
          position[vi * 3] = tmp.x;
          position[vi * 3 + 1] = tmp.y;
          position[vi * 3 + 2] = tmp.z;
          normal[vi * 3] = out.x;
          normal[vi * 3 + 1] = out.y + 0.2;
          normal[vi * 3 + 2] = out.z;
          vi++;
        }
      }
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.normal.needsUpdate = true;
  };
  // 描く直前に動かす（1 コマに 1 回）。遠い（10m 以上）ときは止めておく
  const camPos = new THREE.Vector3();
  mesh.onBeforeRender = (_r, _s, camera) => {
    if (performance.now() / 1000 - last < 0.004) return;
    camera.getWorldPosition(camPos);
    if (camPos.distanceTo(skullW) > 10 && last > 0) {
      last = performance.now() / 1000;
      return;
    }
    update();
  };
  // 最初の形
  update();
  return mesh;
}
