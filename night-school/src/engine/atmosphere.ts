import * as THREE from 'three';

/**
 * 空気の感じ：懐中電灯の光の筋と、光の中を漂うほこり。
 * どちらも懐中電灯（SpotLight）の向き・明るさに合わせて動く。
 */
export class Atmosphere {
  private beam: THREE.Mesh;
  private beamMat: THREE.ShaderMaterial;
  private dust: THREE.Points;
  private dustMat: THREE.ShaderMaterial;
  private base: number;
  private offsets: Float32Array;
  private readonly count = 260;
  private readonly box = new THREE.Vector3(7, 3.2, 7);

  constructor(
    scene: THREE.Scene,
    private camera: THREE.Camera,
    private spot: THREE.SpotLight,
  ) {
    this.base = spot.intensity;

    // 光の筋：懐中電灯から前へ伸びる、うすい円錐
    const len = 5;
    const radius = Math.tan(spot.angle) * len * 0.8;
    const geo = new THREE.CylinderGeometry(0.03, radius, len, 24, 8, true);
    geo.translate(0, -len / 2, 0);
    geo.rotateX(-Math.PI / 2); // 細い方が原点、+z の向きに広がる
    this.beamMat = new THREE.ShaderMaterial({
      uniforms: { power: { value: 1 }, time: { value: 0 }, len: { value: len } },
      vertexShader: /* glsl */ `
        varying float vAlong;
        varying vec3 vNormal;
        varying vec3 vView;
        varying vec3 vLocal;
        uniform float len;
        void main() {
          vAlong = position.z / len;
          vLocal = position;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vView = normalize(-mv.xyz);
          vNormal = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        varying float vAlong;
        varying vec3 vNormal;
        varying vec3 vView;
        varying vec3 vLocal;
        uniform float power;
        uniform float time;
        void main() {
          // 縁ほど薄く（円錐の側面を斜めに見る所だけが光って見える）、先へ行くほど消える
          float edge = pow(abs(dot(vNormal, vView)), 1.6);
          float fade = pow(1.0 - clamp(vAlong, 0.0, 1.0), 1.7) * smoothstep(0.0, 0.08, vAlong);
          float n = 0.75 + 0.25 * sin(vLocal.z * 3.1 + time * 0.7) * sin(atan(vLocal.y, vLocal.x) * 5.0 - time * 0.4);
          float a = edge * fade * n * 0.05 * power;
          gl_FragColor = vec4(vec3(1.0, 0.95, 0.84) * a, 1.0);
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    this.beam = new THREE.Mesh(geo, this.beamMat);
    this.beam.renderOrder = 5;
    this.beam.frustumCulled = false;
    camera.add(this.beam);

    // ほこり：カメラのまわりの箱の中に散らし、懐中電灯の光が当たる粒だけ光らせる
    const pos = new Float32Array(this.count * 3);
    this.offsets = new Float32Array(this.count * 3);
    for (let i = 0; i < this.count * 3; i++) this.offsets[i] = Math.random();
    const dg = new THREE.BufferGeometry();
    dg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.dustMat = new THREE.ShaderMaterial({
      uniforms: {
        spotPos: { value: new THREE.Vector3() },
        spotDir: { value: new THREE.Vector3() },
        cosAngle: { value: Math.cos(spot.angle) },
        power: { value: 1 },
        pixelRatio: { value: 1 },
      },
      vertexShader: /* glsl */ `
        uniform vec3 spotPos;
        uniform vec3 spotDir;
        uniform float cosAngle;
        uniform float power;
        uniform float pixelRatio;
        varying float vLight;
        void main() {
          vec3 toP = position - spotPos;
          float d = length(toP);
          float inCone = smoothstep(cosAngle, cosAngle + 0.06, dot(toP / d, spotDir));
          vLight = inCone * power * clamp(1.0 - d / 5.0, 0.0, 1.0) * smoothstep(0.2, 0.6, d);
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = pixelRatio * 1.4 * (1.0 + 1.5 / max(-mv.z, 0.3));
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        varying float vLight;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float a = smoothstep(0.5, 0.0, length(c)) * vLight * 0.28;
          if (a < 0.003) discard;
          gl_FragColor = vec4(vec3(1.0, 0.96, 0.88) * a, 1.0);
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.dust = new THREE.Points(dg, this.dustMat);
    this.dust.frustumCulled = false;
    scene.add(this.dust);
  }

  setPixelRatio(r: number): void {
    this.dustMat.uniforms.pixelRatio.value = r;
  }

  update(time: number): void {
    const power = this.base > 0 ? this.spot.intensity / this.base : 0;
    this.beamMat.uniforms.power.value = power;
    this.beamMat.uniforms.time.value = time;
    // 筋を懐中電灯の位置・向きに合わせる
    const spotPos = this.spot.getWorldPosition(new THREE.Vector3());
    const target = this.spot.target.getWorldPosition(new THREE.Vector3());
    const dir = target.sub(spotPos).normalize();
    const local = this.camera.worldToLocal(spotPos.clone());
    this.beam.position.copy(local);
    const camQ = this.camera.getWorldQuaternion(new THREE.Quaternion());
    const localDir = dir.clone().applyQuaternion(camQ.clone().invert());
    this.beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), localDir);

    // ほこり：ゆっくり漂いながら、カメラのまわりの箱に収まるよう折り返す
    const cam = this.camera.getWorldPosition(new THREE.Vector3());
    const pos = this.dust.geometry.getAttribute('position') as THREE.BufferAttribute;
    const b = this.box;
    for (let i = 0; i < this.count; i++) {
      const o = this.offsets;
      const drift = time * 0.02;
      const fx = (o[i * 3] + drift * (0.3 + o[i * 3 + 1] * 0.4) - (cam.x / b.x)) % 1;
      const fy = (o[i * 3 + 1] + Math.sin(time * 0.1 + i) * 0.01 - drift * 0.15) % 1;
      const fz = (o[i * 3 + 2] + drift * 0.2 - (cam.z / b.z)) % 1;
      const w = (f: number) => (f < 0 ? f + 1 : f) - 0.5;
      pos.setXYZ(i, cam.x + w(fx) * b.x, 0.2 + (w(fy) + 0.5) * b.y, cam.z + w(fz) * b.z);
    }
    pos.needsUpdate = true;
    this.dustMat.uniforms.spotPos.value.copy(spotPos);
    this.dustMat.uniforms.spotDir.value.copy(dir);
    this.dustMat.uniforms.power.value = power;
  }
}
