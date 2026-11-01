import * as THREE from 'three';
import { GPUComputationRenderer } from 'three/examples/jsm/misc/GPUComputationRenderer.js';
import type { Human } from '../../world/human';
import type { HairStyle } from './hair';

/*
 * GPU の髪：芯の毛（ガイド）を数百本、GPU で物理計算し、その間を数千本の細い毛で埋めて描く。
 *
 * 計算（GPUComputationRenderer）：画像 1 枚 = 横が毛の節（根もと→毛先）、縦がガイドの本数。
 *   1 画素ごとに、その毛の根もとから自分の節までを順にたどる（follow-the-leader）：
 *   慣性と重さで進めた点を、一つ前の点からの長さ・曲がりにくさ・頭と体との当たりで直す。
 *   根もと側は髪型へばねで戻り、毛先へ行くほど自由に揺れる。
 * 描画：細い毛 1 本 = 細長い帯。近くの 3 本のガイドの位置を混ぜて形を決め、
 *   毛先ほどガイドへ寄せて毛束にまとめる。幅は画面上で 1 画素前後。
 *   艶は、毛の向きと視線から求める（髪特有の、光が輪のように乗る反射）。
 *
 * 近くの人物の髪だけをこの方式にし（重いので）、ほかは毛束の板の髪（hair.ts）のまま。
 */

const NODES = 16;

type Variable = ReturnType<GPUComputationRenderer['addVariable']>;

export interface GpuHairOptions {
  /** ガイド（芯の毛）の本数 */
  guides: number;
  /** 細い毛の本数（画質「高」のとき。「標準」は半分） */
  strands: number;
  /** 毛束へのまとまり（0〜1。濡れた髪は大きく） */
  clump: number;
  /** 毛 1 本の太さ（画素） */
  widthPx: number;
  /** 毛ごとのばらつき（m、毛先での最大のずれ） */
  scatter?: number;
}

interface Entry {
  figure: THREE.Object3D;
  h: Human;
  card: THREE.Object3D;
  mesh: THREE.Mesh;
  gpu: GPUComputationRenderer | null;
  vars: { pos: Variable; prev: Variable } | null;
  init: (r: THREE.WebGLRenderer) => boolean;
  active: boolean;
  reset: boolean;
  lastSkull: THREE.Vector3;
  acc: number;
  time: number;
  style: HairStyle;
  rest: THREE.DataTexture;
  uniforms: Record<string, THREE.IUniform>;
  material: THREE.MeshStandardMaterial;
  strands: number;
}

const entries: Entry[] = [];
(globalThis as unknown as { __gpuHair: Entry[] }).__gpuHair = entries;
let supported: boolean | null = null;

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

/** 頭皮から垂らしたガイドの休みの形（頭の骨の座標）。hair.ts の毛束と同じ髪型の決め方 */
function growGuides(h: Human, style: HairStyle, count: number): { rest: THREE.Vector3[][]; theta: number[]; face: number } {
  const rand = rng(style.seed * 31 + 7);
  const c = h.skull.center;
  const r = h.skull.radius * 1.03;
  const rest: THREE.Vector3[][] = [];
  const thetas: number[] = [];
  const extra = style.part ? (style.faceStrands ?? 0) : 0;
  for (let i = 0; i < count * 4 && rest.length < count + extra; i++) {
    const strand = rest.length >= count;
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
    const pts = [p.clone()];
    const step = L / (NODES - 1);
    const q = p.clone();
    for (let k = 1; k < NODES; k++) {
      q.addScaledVector(dir, step);
      const v = q.clone().sub(c);
      if (v.length() < r * 1.05) q.copy(c).addScaledVector(v.normalize(), r * 1.05);
      if (q.y < cut) q.y = cut;
      pts.push(q.clone());
      dir = dir.lerp(new THREE.Vector3(hx * 0.03, -1, hz * 0.03), 0.6 * (8 / NODES)).normalize();
    }
    rest.push(pts);
    thetas.push(theta);
  }
  // 最後の face 本は、分け目の中に垂れる毛束（顔の前）
  return { rest, theta: thetas, face: Math.max(0, rest.length - count) };
}

const SIM = /* glsl */ `
  uniform sampler2D restTex;
  uniform mat4 headMat;
  uniform vec3 move;
  uniform float dt;
  uniform float hold;
  uniform float stiff;
  uniform float falloff;
  uniform vec3 skull;
  uniform float skullR;
  uniform vec3 capA[6];
  uniform vec3 capB[6];
  uniform float capR[6];
  uniform float scale;
  uniform float time;
  uniform float resetFlag;
  uniform float bendK;
  uniform float swayK;
  #define NODES ${NODES}.0

  vec4 restAt(float k, float g) { return texture2D(restTex, vec2((k + 0.5) / NODES, (g + 0.5) / resolution.y)); }
  vec3 restW(float k, float g) { return (headMat * vec4(restAt(k, g).xyz, 1.0)).xyz; }

  // 慣性と重さで進め、髪型へばねで戻した点
  vec3 predict(float k, float g) {
    vec2 uv = vec2((k + 0.5) / NODES, (g + 0.5) / resolution.y);
    vec3 r = restW(k, g);
    if (resetFlag > 0.5) return r;
    vec3 p = texture2D(texturePos, uv).xyz + move;
    vec3 pv = texture2D(texturePrev, uv).xyz + move;
    vec3 np = p + (p - pv) * 0.985 + vec3(0.0, -9.8 * dt * dt, 0.0);
    // 空気のゆらぎ（毛先ほど大きく）
    np.x += swayK * 0.00003 * sin(time * 1.3 + g * 7.13) * k;
    np.z += swayK * 0.00002 * sin(time * 0.9 + g * 3.7) * k;
    float t = k / NODES;
    np = mix(np, r, 1.0 - exp(-stiff * pow(1.0 - t, falloff) * dt));
    return np;
  }

  vec3 collide(vec3 p) {
    vec3 d = p - skull;
    float l = length(d);
    float rr = skullR * 1.04;
    if (l < rr) p = skull + d / max(l, 1e-5) * rr;
    for (int i = 0; i < 6; i++) {
      vec3 ab = capB[i] - capA[i];
      float t = clamp(dot(p - capA[i], ab) / max(dot(ab, ab), 1e-9), 0.0, 1.0);
      vec3 c = capA[i] + ab * t;
      vec3 e = p - c;
      float el = length(e);
      if (el < capR[i]) p = c + (el > 1e-5 ? e / el : vec3(0.0, 0.0, 1.0)) * capR[i];
    }
    return p;
  }

  // 根もとから節 n（と、その次の節）までたどる。fix には次の節の直しの量（予測→直した位置）を返す
  vec3 chain(float n, float g, out vec3 fix) {
    vec3 cur = restW(0.0, g);
    vec3 back = cur;
    vec3 result = cur;
    fix = vec3(0.0);
    for (float k = 1.0; k < NODES; k += 1.0) {
      if (k > n + 1.0) break;
      vec3 q;
      vec3 pred;
      if (k < hold) {
        q = restW(k, g);
        pred = q;
      } else {
        pred = predict(k, g);
        q = pred;
        float L = restAt(k, g).w * scale;
        vec3 d = q - cur;
        q = cur + d / max(length(d), 1e-6) * L;
        // 曲がりにくさ：二つ前の点から近づきすぎない
        if (k >= 2.0 && bendK > 0.0) {
          float want = distance(restAt(k, g).xyz, restAt(k - 2.0, g).xyz) * scale * 0.92;
          vec3 e = q - back;
          float el = length(e);
          if (el < want) q += e / max(el, 1e-6) * (want - el) * bendK;
        }
        q = collide(q);
        d = q - cur;
        q = cur + d / max(length(d), 1e-6) * L;
      }
      if (k == n + 1.0) {
        fix = q - pred;
        break;
      }
      back = cur;
      cur = q;
      result = cur;
    }
    return n < 0.5 ? restW(0.0, g) : result;
  }

  void main() {
    float n = floor(gl_FragCoord.x);
    float g = floor(gl_FragCoord.y);
    vec3 fix;
    vec3 p = chain(n, g, fix);
  #ifdef OUT_PREV
    // 次の速さ = 動いた量 − 次の節の直しの量（DFTL）。直しのせいで毛先が勢いづかないように
    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec3 old = texture2D(texturePos, uv).xyz + move;
    if (resetFlag > 0.5 || n < hold) old = p;
    gl_FragColor = vec4(old + fix * 0.9, 1.0);
  #else
    gl_FragColor = vec4(p, 1.0);
  #endif
  }
`;

/** 一つ前の位置：同じ鎖をたどり、速さの直しを入れて書く */
const PREV = '#define OUT_PREV\n' + SIM;

/** 細い毛の帯の形（全部の毛で共通）と、毛ごとの情報（どのガイドを混ぜるか・まとまり・ずれ） */
function strandGeometry(guides: { rest: THREE.Vector3[][]; theta: number[]; face: number }, count: number, clump: number, scatter: number, seed: number): THREE.InstancedBufferGeometry {
  const geo = new THREE.InstancedBufferGeometry();
  const seg = new Float32Array(NODES * 2);
  const side = new Float32Array(NODES * 2);
  const index: number[] = [];
  for (let k = 0; k < NODES; k++) {
    seg.set([k, k], k * 2);
    side.set([-1, 1], k * 2);
    if (k < NODES - 1) {
      const b = k * 2;
      index.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
    }
  }
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(NODES * 2 * 3), 3));
  geo.setAttribute('seg', new THREE.BufferAttribute(seg, 1));
  geo.setAttribute('side', new THREE.BufferAttribute(side, 1));
  geo.setIndex(index);
  // ガイドの根もとの近さから、毛ごとに近い 3 本を選ぶ
  const roots = guides.rest.map((r) => r[0]);
  const G = roots.length;
  const near: number[][] = roots.map((a, i) =>
    roots
      .map((b, j) => [j, a.distanceTo(b)] as const)
      .filter(([j]) => j !== i)
      .sort((x, y) => x[1] - y[1])
      .slice(0, 4)
      .map(([j]) => j),
  );
  const rand = rng(seed);
  const gi = new Float32Array(count * 3);
  const bw = new Float32Array(count * 2);
  const prm = new Float32Array(count * 4);
  const firstFace = G - guides.face;
  for (let i = 0; i < count; i++) {
    let g0 = Math.floor(rand() * G);
    // 顔の前の毛束は細く（本数を減らす）
    if (g0 >= firstFace && rand() < 0.6) g0 = Math.floor(rand() * firstFace);
    const face = g0 >= firstFace;
    const nb = face ? [g0] : near[g0].filter((j) => j < firstFace);
    // 分け目をまたいで混ぜないよう、根もとが遠すぎるガイドは使わない
    const okFar = (j: number) => j !== undefined && roots[g0].distanceTo(roots[j]) < 0.035;
    const g1 = nb[Math.floor(rand() * nb.length)];
    const g2 = nb[Math.floor(rand() * nb.length)];
    let w1 = rand() * 0.5;
    let w2 = rand() * 0.5;
    if (w1 + w2 > 0.75) {
      w1 *= 0.5;
      w2 *= 0.5;
    }
    gi.set([g0, okFar(g1) ? g1 : g0, okFar(g2) ? g2 : g0], i * 3);
    bw.set([w1, w2], i * 2);
    // 長さの違い・まとまり・ずれの向き・ずれの大きさ
    prm.set([0.82 + rand() * 0.18, clump * (0.6 + rand() * 0.6), rand() * Math.PI * 2, scatter * (0.25 + rand() * 0.75)], i * 4);
  }
  geo.setAttribute('guides', new THREE.InstancedBufferAttribute(gi, 3));
  geo.setAttribute('bary', new THREE.InstancedBufferAttribute(bw, 2));
  geo.setAttribute('params', new THREE.InstancedBufferAttribute(prm, 4));
  geo.instanceCount = count;
  return geo;
}

/** 毛を描く材質：形は計算結果の画像から、光は MeshStandard の仕組みに任せ、髪の艶を足す */
function strandMaterial(color: number, uniforms: Record<string, THREE.IUniform>): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0, side: THREE.DoubleSide });
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute float seg;
        attribute float side;
        attribute vec3 guides;
        attribute vec2 bary;
        attribute vec4 params;
        uniform sampler2D posTex;
        uniform vec2 simRes;
        uniform mat4 invFigure;
        uniform vec3 skullL;
        uniform float widthPx;
        uniform vec2 viewport;
        varying vec3 vHairT;
        varying float vHairT01;
        varying float vHairShade;
        vec3 gp(float g, float k) { return texture2D(posTex, vec2((k + 0.5) / simRes.x, (g + 0.5) / simRes.y)).xyz; }
        vec3 strandAt(float k) {
          float t = k / (simRes.x - 1.0);
          vec3 a = gp(guides.x, k);
          vec3 p = a * (1.0 - bary.x - bary.y) + gp(guides.y, k) * bary.x + gp(guides.z, k) * bary.y;
          // 毛先ほどガイドへ寄せて、毛束にまとめる
          p = mix(p, a, params.y * t);
          return (invFigure * vec4(p, 1.0)).xyz;
        }
        vec3 strandPos(float k) {
          float kk = k * params.x;
          float k0 = floor(kk);
          float k1 = min(k0 + 1.0, simRes.x - 1.0);
          return mix(strandAt(k0), strandAt(k1), kk - k0);
        }`,
      )
      .replace(
        '#include <beginnormal_vertex>',
        `vec3 hairP = strandPos(seg);
        vec3 hairN2 = strandPos(min(seg + 1.0, simRes.x - 1.0));
        vec3 hairNp = strandPos(max(seg - 1.0, 0.0));
        vec3 hairTan = normalize(hairN2 - hairNp + vec3(0.0, -1e-5, 0.0));
        // 毛ごとに少しずらして、ふくらみを出す（根もとは小さく）
        vec3 s1 = normalize(cross(hairTan, vec3(0.0, 0.0, 1.0)) + vec3(1e-4));
        vec3 s2 = cross(hairTan, s1);
        float tt = seg / (simRes.x - 1.0);
        hairP += (cos(params.z) * s1 + sin(params.z) * s2) * params.w * (0.3 + tt);
        vec3 objectNormal = normalize(mix(normalize(hairP - skullL), -s2, 0.3));
        vHairT = normalize((modelViewMatrix * vec4(hairTan, 0.0)).xyz);
        vHairT01 = tt;
        vHairShade = 0.75 + 0.5 * fract(params.z * 7.31);`,
      )
      .replace('#include <begin_vertex>', 'vec3 transformed = hairP;')
      .replace(
        '#include <project_vertex>',
        `vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0);
        vec4 clipA = projectionMatrix * mvPosition;
        vec4 clipB = projectionMatrix * modelViewMatrix * vec4(transformed + hairTan * 0.01, 1.0);
        vec2 sa = clipA.xy / clipA.w * viewport;
        vec2 sb = clipB.xy / clipB.w * viewport;
        vec2 dir = normalize(sb - sa + vec2(1e-6));
        vec2 nrm = vec2(-dir.y, dir.x);
        float w = widthPx * (1.0 - 0.55 * tt);
        clipA.xy += nrm * side * w / viewport * clipA.w;
        gl_Position = clipA;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vHairT;
        varying float vHairT01;
        varying float vHairShade;`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        // 根もとは暗く、毛先は少し明るく。毛ごとに明るさを変える
        diffuseColor.rgb *= vHairShade * mix(0.55, 1.15, vHairT01);`,
      )
      .replace(
        '#include <opaque_fragment>',
        `{
          // 髪の艶（Kajiya-Kay）：懐中電灯は目の位置にあるので、視線と毛の向きだけで決まる
          vec3 V = normalize(vViewPosition);
          float tv = dot(normalize(vHairT), V);
          float spec = pow(max(0.0, 1.0 - tv * tv), 48.0);
          float spec2 = pow(max(0.0, 1.0 - tv * tv), 8.0);
          outgoingLight += outgoingLight * (spec * 2.2 + spec2 * 0.25);
        }
        #include <opaque_fragment>`,
      );
  };
  m.customProgramCacheKey = () => 'gpuhair';
  return m;
}

/**
 * GPU の髪を付ける（使えない環境・画質「低」では何もしない）。card は今までの毛束の髪：
 * GPU の髪を使っている間は隠し、使わない間（遠い・画面の外・ほかの人物に譲った）は見せる
 */
export function attachGpuHair(h: Human, figure: THREE.Object3D, card: THREE.Object3D, color: number, style: HairStyle, opts: GpuHairOptions): void {
  const guides = growGuides(h, style, opts.guides);
  const G = guides.rest.length;
  // 休みの形の画像（xyz = 頭の骨の座標、w = 一つ前の節からの長さ）
  const data = new Float32Array(NODES * G * 4);
  guides.rest.forEach((pts, g) => {
    pts.forEach((p, k) => {
      const i = (g * NODES + k) * 4;
      data[i] = p.x;
      data[i + 1] = p.y;
      data[i + 2] = p.z;
      data[i + 3] = k > 0 ? Math.max(p.distanceTo(pts[k - 1]), 0.0005) : 0;
    });
  });
  const rest = new THREE.DataTexture(data, NODES, G, THREE.RGBAFormat, THREE.FloatType);
  rest.needsUpdate = true;
  const uniforms: Record<string, THREE.IUniform> = {
    posTex: { value: null },
    simRes: { value: new THREE.Vector2(NODES, G) },
    invFigure: { value: new THREE.Matrix4() },
    skullL: { value: new THREE.Vector3() },
    widthPx: { value: opts.widthPx },
    viewport: { value: new THREE.Vector2(800, 600) },
  };
  const material = strandMaterial(color, uniforms);
  const geo = strandGeometry(guides, opts.strands, opts.clump, opts.scatter ?? 0.008, style.seed + 3);
  const mesh = new THREE.Mesh(geo, material);
  mesh.visible = false;
  mesh.castShadow = false;
  // 位置は画像から決まるので、境界は人物全体を覆う大きさにする
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1, 0), 1.6);
  figure.add(mesh);
  const entry: Entry = {
    figure,
    h,
    card,
    mesh,
    gpu: null,
    vars: null,
    active: false,
    reset: true,
    lastSkull: new THREE.Vector3(),
    acc: 0,
    time: 0,
    style,
    rest,
    uniforms,
    material,
    strands: opts.strands,
    init: (renderer) => {
      if (entry.gpu) return true;
      const gpu = new GPUComputationRenderer(NODES, G, renderer);
      const tex0 = gpu.createTexture();
      const pos = gpu.addVariable('texturePos', SIM, tex0);
      const prev = gpu.addVariable('texturePrev', PREV, gpu.createTexture());
      gpu.setVariableDependencies(pos, [pos, prev]);
      gpu.setVariableDependencies(prev, [pos, prev]);
      const k = h.height / 1.25;
      const su = pos.material.uniforms;
      Object.assign(su, {
        restTex: { value: rest },
        headMat: { value: new THREE.Matrix4() },
        move: { value: new THREE.Vector3() },
        dt: { value: 1 / 60 },
        hold: { value: Math.max(1, (style.rootHold ?? 2) * 2) },
        stiff: { value: style.stiff },
        falloff: { value: style.falloff ?? 1 },
        skull: { value: new THREE.Vector3() },
        skullR: { value: h.skull.radius },
        capA: { value: Array.from({ length: 6 }, () => new THREE.Vector3()) },
        capB: { value: Array.from({ length: 6 }, () => new THREE.Vector3()) },
        capR: { value: [0.035, 0.1, 0.045, 0.045, 0.032, 0.032].map((r) => r * k + 0.012) },
        scale: { value: 1 },
        time: { value: 0 },
        resetFlag: { value: 1 },
        bendK: { value: 0.5 },
        swayK: { value: 1 },
      });
      // 一つ前の位置の計算も、同じ値を使う（同じ物を指す）
      for (const key of Object.keys(su)) if (!(key in prev.material.uniforms) || key === 'restTex') prev.material.uniforms[key] = su[key];
      const err = gpu.init();
      if (err) {
        console.warn('[gpuhair]', err);
        supported = false;
        return false;
      }
      entry.gpu = gpu;
      (entry as unknown as { renderer: THREE.WebGLRenderer }).renderer = renderer;
      entry.vars = { pos, prev };
      return true;
    },
  };
  entries.push(entry);
  // 人物が片づけられたら、一覧から外す
  figure.addEventListener('removed', () => {
    const i = entries.indexOf(entry);
    if (i >= 0) entries.splice(i, 1);
  });
}

function shown(o: THREE.Object3D | null): boolean {
  while (o) {
    if (!o.visible) return false;
    o = o.parent;
  }
  return true;
}

const CAPS: [string, string][] = [
  ['neck', 'head'],
  ['spine', 'neck'],
  ['clavicle_L', 'upperarm_L'],
  ['clavicle_R', 'upperarm_R'],
  ['upperarm_L', 'lowerarm_L'],
  ['upperarm_R', 'lowerarm_R'],
];
const tmp = new THREE.Vector3();
const camPos = new THREE.Vector3();
const frustum = new THREE.Frustum();
const projView = new THREE.Matrix4();

/**
 * 毎フレーム、描く前に呼ぶ。近くて画面に映っている人物から順に、max 人まで GPU の髪にする。
 * dt は前のフレームからの秒数
 */
export function stepGpuHair(renderer: THREE.WebGLRenderer, camera: THREE.Camera, dt: number, max: number, density = 1): void {
  if (supported === null) supported = renderer.capabilities.isWebGL2 && renderer.extensions.has('EXT_color_buffer_float');
  camera.getWorldPosition(camPos);
  camera.updateMatrixWorld();
  projView.multiplyMatrices((camera as THREE.PerspectiveCamera).projectionMatrix, camera.matrixWorldInverse);
  frustum.setFromProjectionMatrix(projView);
  // 近い順に、画面に映っている人物を選ぶ
  const cands: { e: Entry; d: number }[] = [];
  for (const e of entries) {
    const ok = supported && max > 0 && shown(e.figure);
    let d = Infinity;
    if (ok) {
      e.h.bones.head.getWorldPosition(tmp);
      d = tmp.distanceTo(camPos);
      if (d > 9 || !frustum.intersectsSphere(new THREE.Sphere(tmp.clone().setY(tmp.y - 0.3), 0.6))) d = Infinity;
    }
    cands.push({ e, d });
  }
  cands.sort((a, b) => a.d - b.d);
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  cands.forEach(({ e, d }, i) => {
    const want = d < Infinity && i < max && e.init(renderer);
    if (want !== e.active) {
      e.active = want;
      e.reset = true;
      e.acc = 0;
    }
    e.mesh.visible = e.active;
    e.card.visible = !e.active;
    if (!e.active || !e.gpu || !e.vars) return;
    (e.mesh.geometry as THREE.InstancedBufferGeometry).instanceCount = Math.max(500, Math.floor(e.strands * density));
    simulate(e, dt);
    e.uniforms.posTex.value = e.gpu.getCurrentRenderTarget(e.vars.pos).texture;
    e.uniforms.viewport.value.set(size.x, size.y);
  });
}

function simulate(e: Entry, dt: number): void {
  const { h, figure } = e;
  const su = e.vars!.pos.material.uniforms;
  figure.updateWorldMatrix(true, true);
  const head = h.bones.head;
  su.headMat.value.copy(head.matrixWorld);
  const s = head.getWorldScale(tmp).x;
  su.scale.value = s;
  const skull = h.skull.center.clone().applyMatrix4(head.matrixWorld);
  su.skull.value.copy(skull);
  su.skullR.value = h.skull.radius * s;
  CAPS.forEach(([a, b], i) => {
    h.bones[a].getWorldPosition(su.capA.value[i]);
    h.bones[b].getWorldPosition(su.capB.value[i]);
  });
  e.uniforms.invFigure.value.copy(figure.matrixWorld).invert();
  e.uniforms.skullL.value.copy(skull).applyMatrix4(e.uniforms.invFigure.value);
  const inertia = e.style.inertia ?? 0.7;
  const STEP = 1 / 60;
  if (e.reset || e.lastSkull.distanceTo(skull) > 0.6) {
    // 髪型の形から、重さで垂れた形まで落ち着かせる
    su.move.value.set(0, 0, 0);
    su.resetFlag.value = 1;
    e.gpu!.compute();
    su.resetFlag.value = 0;
    for (let i = 0; i < 30; i++) e.gpu!.compute();
    e.reset = false;
    e.lastSkull.copy(skull);
    return;
  }
  e.acc = Math.min(e.acc + dt, STEP * 4);
  const n = Math.floor(e.acc / STEP);
  if (n === 0) return;
  // 頭の移動の一部は髪ごと動かし、残りを慣性として残す
  su.move.value.copy(skull).sub(e.lastSkull).multiplyScalar((1 - inertia) / n);
  for (let i = 0; i < n; i++) {
    e.time += STEP;
    su.time.value = e.time;
    e.gpu!.compute();
  }
  e.acc -= n * STEP;
  e.lastSkull.copy(skull);
}
