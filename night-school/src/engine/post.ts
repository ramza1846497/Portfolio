import * as THREE from 'three';
import { N8AOPass } from 'n8ao';
import type { QualitySettings } from './quality';

/**
 * 画面の後処理：シーンを一度画像に描いてから、仕上げをかけて画面に出す。
 *  - 光のにじみ（明るい所だけ抜き出して、小さな画像でぼかして足す）
 *  - 色味：暗がりを青緑に寄せ、少し色を抜く（夜の蛍光灯の色）
 *  - 周辺減光・画面の端の色ずれ・フィルムの粒子
 * 暗い場面が多いので、途中の画像は半精度の浮動小数点で持ち、暗部の段差（バンディング）を防ぐ。
 */
export class PostFX {
  private scene: THREE.WebGLRenderTarget;
  private bloomA: THREE.WebGLRenderTarget | null = null;
  private bloomB: THREE.WebGLRenderTarget | null = null;
  private quad: THREE.Mesh;
  private quadScene = new THREE.Scene();
  private quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private bright: THREE.ShaderMaterial;
  private blur: THREE.ShaderMaterial;
  private composite: THREE.ShaderMaterial;
  /** 隅や接地面の陰（シーンを描くところから受け持つ） */
  private ao: N8AOPass | null = null;

  constructor(
    private renderer: THREE.WebGLRenderer,
    private q: QualitySettings,
    scene3d: THREE.Scene,
    camera: THREE.PerspectiveCamera,
  ) {
    const opts = { type: THREE.HalfFloatType, depthBuffer: true };
    this.scene = new THREE.WebGLRenderTarget(1, 1, opts);
    if (q.bloomScale > 0) {
      const small = { type: THREE.HalfFloatType, depthBuffer: false };
      this.bloomA = new THREE.WebGLRenderTarget(1, 1, small);
      this.bloomB = new THREE.WebGLRenderTarget(1, 1, small);
    }
    this.bright = new THREE.ShaderMaterial({
      uniforms: { tScene: { value: null }, threshold: { value: 0.85 } },
      vertexShader: VERT,
      fragmentShader: BRIGHT,
      depthTest: false,
      depthWrite: false,
    });
    this.blur = new THREE.ShaderMaterial({
      uniforms: { tSrc: { value: null }, dir: { value: new THREE.Vector2() } },
      vertexShader: VERT,
      fragmentShader: BLUR,
      depthTest: false,
      depthWrite: false,
    });
    this.composite = new THREE.ShaderMaterial({
      uniforms: {
        tScene: { value: this.scene.texture },
        tBloom: { value: this.bloomB?.texture ?? null },
        bloom: { value: q.bloomScale > 0 ? 0.7 : 0 },
        film: { value: q.film ? 1 : 0 },
        time: { value: 0 },
        res: { value: new THREE.Vector2(1, 1) },
      },
      vertexShader: VERT,
      fragmentShader: COMPOSITE,
      depthTest: false,
      depthWrite: false,
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.composite);
    if (q.ao !== 'off') {
      const size = renderer.getDrawingBufferSize(new THREE.Vector2());
      const ao = new N8AOPass(scene3d, camera, size.x, size.y);
      ao.renderToScreen = false;
      Object.assign(ao.configuration, {
        // 1m くらいの範囲で、壁と床の境目・机の下・人の足元を暗くする
        aoRadius: 0.9,
        distanceFalloff: 0.6,
        intensity: 2.6,
        aoSamples: q.ao === 'full' ? 16 : 8,
        denoiseSamples: q.ao === 'full' ? 8 : 4,
        denoiseRadius: 10,
        halfRes: q.ao === 'half',
        gammaCorrection: false,
        color: new THREE.Color(0, 0, 0),
      });
      this.ao = ao;
    }
    this.quad.frustumCulled = false;
    this.quadScene.add(this.quad);
    this.resize();
  }

  resize(): void {
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    this.scene.setSize(size.x, size.y);
    this.composite.uniforms.res.value.copy(size);
    this.ao?.setSize(size.x, size.y);
    if (this.bloomA && this.bloomB) {
      const w = Math.max(1, Math.round(size.x * this.q.bloomScale));
      const h = Math.max(1, Math.round(size.y * this.q.bloomScale));
      this.bloomA.setSize(w, h);
      this.bloomB.setSize(w, h);
    }
  }

  render(scene: THREE.Scene, camera: THREE.Camera, time: number): void {
    const r = this.renderer;
    if (this.ao) {
      this.ao.render(r, this.scene, this.scene, 0, false);
    } else {
      r.setRenderTarget(this.scene);
      r.render(scene, camera);
    }
    if (this.bloomA && this.bloomB) {
      // 明るい所だけ → 横にぼかす → 縦にぼかす
      this.pass(this.bright, { tScene: this.scene.texture }, this.bloomA);
      const w = this.bloomA.width;
      const h = this.bloomA.height;
      this.pass(this.blur, { tSrc: this.bloomA.texture, dir: new THREE.Vector2(1 / w, 0) }, this.bloomB);
      this.pass(this.blur, { tSrc: this.bloomB.texture, dir: new THREE.Vector2(0, 1 / h) }, this.bloomA);
      this.pass(this.blur, { tSrc: this.bloomA.texture, dir: new THREE.Vector2(2 / w, 0) }, this.bloomB);
      this.pass(this.blur, { tSrc: this.bloomB.texture, dir: new THREE.Vector2(0, 2 / h) }, this.bloomA);
      this.composite.uniforms.tBloom.value = this.bloomA.texture;
    }
    this.composite.uniforms.time.value = time;
    this.quad.material = this.composite;
    r.setRenderTarget(null);
    r.render(this.quadScene, this.quadCam);
  }

  private pass(mat: THREE.ShaderMaterial, uniforms: Record<string, unknown>, target: THREE.WebGLRenderTarget): void {
    for (const [k, v] of Object.entries(uniforms)) mat.uniforms[k].value = v;
    this.quad.material = mat;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.quadScene, this.quadCam);
  }
}

const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

const BRIGHT = /* glsl */ `
uniform sampler2D tScene;
uniform float threshold;
varying vec2 vUv;
void main() {
  vec3 c = texture2D(tScene, vUv).rgb;
  // 色の一番強い成分で判定（赤い目・赤い光もにじむように）
  float m = max(c.r, max(c.g, c.b));
  float k = smoothstep(threshold, threshold + 0.6, m);
  gl_FragColor = vec4(c * k, 1.0);
}`;

const BLUR = /* glsl */ `
uniform sampler2D tSrc;
uniform vec2 dir;
varying vec2 vUv;
void main() {
  vec3 c = texture2D(tSrc, vUv).rgb * 0.227;
  c += (texture2D(tSrc, vUv + dir * 1.385).rgb + texture2D(tSrc, vUv - dir * 1.385).rgb) * 0.316;
  c += (texture2D(tSrc, vUv + dir * 3.231).rgb + texture2D(tSrc, vUv - dir * 3.231).rgb) * 0.070;
  gl_FragColor = vec4(c, 1.0);
}`;

const COMPOSITE = /* glsl */ `
uniform sampler2D tScene;
uniform sampler2D tBloom;
uniform float bloom;
uniform float film;
uniform float time;
uniform vec2 res;
varying vec2 vUv;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
  vec2 d = vUv - 0.5;
  float r2 = dot(d, d);
  // 画面の端ほど、赤と青が少しずれる
  vec2 off = d * r2 * 0.012 * film;
  vec3 c = vec3(
    texture2D(tScene, vUv + off).r,
    texture2D(tScene, vUv).g,
    texture2D(tScene, vUv - off).b
  );
  if (bloom > 0.0) c += texture2D(tBloom, vUv).rgb * bloom;

  // 色味：暗がりは青緑へ、全体は少し色を抜く
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(c * vec3(0.82, 1.0, 1.06), c, smoothstep(0.0, 0.35, l));
  c = mix(vec3(l), c, 0.82);
  // フィルム調のトーンカーブ（ACES の近似）：暗部は締まり、明るい所はなだらかに飽和する
  c *= 1.5;
  c = clamp((c * (2.51 * c + 0.03)) / (c * (2.43 * c + 0.59) + 0.14), 0.0, 1.0);

  // 周辺減光
  c *= 1.0 - smoothstep(0.08, 0.55, r2) * 0.6;

  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>

  // フィルムの粒子（画面の色の段階で足す）
  float n = hash(vUv * res + fract(time * 0.001) * 917.0) - 0.5;
  gl_FragColor.rgb += n * 0.045 * film;
}`;
