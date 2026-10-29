import * as THREE from 'three';

const FLASH_INTENSITY = 30;
/**
 * 蛍光灯の光源は、この数だけ用意して近くの器具に割り当てる。
 * 光源の数が変わると全部の材質のシェーダーを作り直すことになり、歩くたびに引っかかるので、数は固定にする
 */
const POOL = 4;
/** この距離より遠い蛍光灯の光は計算しない（端で急に消えないよう、手前から弱める） */
const LIGHT_RANGE = 14;

export type FixtureMode = 'steady' | 'flicker' | 'dim' | 'dead';

interface Fixture {
  /** 光を出す器具か（切れた蛍光灯は管の色だけ） */
  hasLight: boolean;
  y: number;
  tubeMat: THREE.MeshBasicMaterial;
  base: number;
  mode: FixtureMode;
  x: number;
  z: number;
  /** strobe(…, tag) で、この明かりだけを明滅させるための名前 */
  tag?: string;
  /** ちらつき用の内部状態 */
  timer: number;
  on: boolean;
  /** 明滅の演出の残り時間など */
  sLeft: number;
  sTimer: number;
  sOn: boolean;
  /** 明滅の強さ（部屋だけの明滅は激しく） */
  sPower: number;
}

/**
 * 照明の管理：懐中電灯・蛍光灯・月明かり。
 * 演出（暗転・明滅）もここで扱う。
 */
export class LightRig {
  readonly flashlight: THREE.SpotLight;
  private fixtures: Fixture[] = [];
  private pool: THREE.PointLight[] = [];
  private blackout = false;
  /** 全体の明滅中（懐中電灯も乱れる） */
  private strobeLeft = 0;
  private flashFlicker = 0;
  private ambient: THREE.HemisphereLight;
  private ambientBase: number;
  /** 懐中電灯が照らしている物までの距離（m）と、それに合わせた明るさの倍率 */
  private nearDist = 10;
  private nearScale = 1;

  constructor(
    private scene: THREE.Scene,
    camera: THREE.Camera,
  ) {
    this.ambient = new THREE.HemisphereLight(0x5a6c99, 0x15110c, 0.35);
    this.ambientBase = this.ambient.intensity;
    scene.add(this.ambient);

    // 懐中電灯：カメラの子にして、少し右下から照らす
    const spot = new THREE.SpotLight(0xfff1d6, FLASH_INTENSITY, 22, 0.5, 0.55, 1.6);
    spot.position.set(0.15, -0.15, 0.1);
    spot.target.position.set(0, -0.2, -5);
    camera.add(spot);
    camera.add(spot.target);
    this.flashlight = spot;

    for (let i = 0; i < POOL; i++) {
      const l = new THREE.PointLight(0xd8f0ff, 0, 9, 1.8);
      l.position.set(0, -100, 0);
      scene.add(l);
      this.pool.push(l);
    }
  }

  /** 懐中電灯が照らしている物までの距離を伝える（遠い・何もなければ大きな値） */
  setNearDistance(d: number): void {
    this.nearDist = d;
  }

  /** 天井の蛍光灯を 1 つ追加する */
  addFluorescent(x: number, y: number, z: number, mode: FixtureMode, rotY = 0, intensity = 4, tag?: string): void {
    const group = new THREE.Group();
    group.position.set(x, y, z);
    group.rotation.y = rotY;
    const housing = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.06, 0.22), new THREE.MeshLambertMaterial({ color: 0x8a877a }));
    housing.position.y = 0.03;
    group.add(housing);
    const tubeMat = new THREE.MeshBasicMaterial({ color: 0x333333 });
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.2, 6), tubeMat);
    tube.rotation.z = Math.PI / 2;
    tube.position.y = -0.03;
    group.add(tube);
    this.scene.add(group);

    const base = mode === 'dim' ? intensity * 0.45 : intensity;
    this.fixtures.push({ hasLight: mode !== 'dead', y: y - 0.25, tubeMat, base, mode, x, z, tag, timer: Math.random() * 2, on: mode !== 'dead', sLeft: 0, sTimer: 0, sOn: true, sPower: 1.3 });
  }

  setBlackout(on: boolean): void {
    this.blackout = on;
  }

  /** 照明が明滅する演出。tag を付けると、その明かりだけが激しく明滅する */
  strobe(seconds: number, tag?: string): void {
    if (!tag) this.strobeLeft = seconds;
    for (const f of this.fixtures) {
      if (tag && f.tag !== tag) continue;
      f.sLeft = seconds;
      f.sTimer = 0;
      f.sPower = tag ? 2.2 : 1.3;
    }
  }

  /** 懐中電灯を一瞬弱める（怪異の気配） */
  flickerFlashlight(seconds: number): void {
    this.flashFlicker = seconds;
  }

  /**
   * 光源はプレイヤーに近い器具から順に、用意した数だけ割り当てる。
   */
  update(dt: number, playerX = 0, playerZ = 0): void {
    if (this.strobeLeft > 0) this.strobeLeft -= dt;
    let anyDark = false;
    const near: { f: Fixture; d: number; k: number }[] = [];

    for (const f of this.fixtures) {
      if (f.mode === 'flicker') {
        f.timer -= dt;
        if (f.timer <= 0) {
          // しばらく点いた後、短く何度か途切れる
          f.on = !f.on;
          f.timer = f.on ? 0.05 + Math.random() * (Math.random() < 0.3 ? 2.5 : 0.25) : 0.03 + Math.random() * 0.12;
        }
      }
      let k = f.on ? 1 : 0;
      if (f.sLeft > 0) {
        f.sLeft -= dt;
        f.sTimer -= dt;
        if (f.sTimer <= 0) {
          f.sOn = !f.sOn;
          f.sTimer = 0.03 + Math.random() * (f.sOn ? 0.12 : 0.08);
        }
        // 消えた明かりも、この間だけは点く
        k = f.sOn ? f.sPower * (0.6 + Math.random() * 0.4) : 0;
        if (!f.sOn) anyDark = true;
      }
      if (this.blackout) k = 0;
      if (f.hasLight) {
        const d = Math.hypot(f.x - playerX, f.z - playerZ);
        if (d < LIGHT_RANGE) near.push({ f, d, k });
      }
      const lit = (f.mode !== 'dead' || f.sLeft > 0) && k > 0;
      f.tubeMat.color.setHex(lit ? (f.mode === 'dim' ? 0x9fb4b8 : 0xeaffff) : 0x2a2a2a);
    }

    near.sort((a, b) => a.d - b.d);
    this.pool.forEach((l, i) => {
      const n = near[i];
      if (!n) {
        l.intensity = 0;
        return;
      }
      l.position.set(n.f.x, n.f.y, n.f.z);
      // 遠い明かりは手前から弱めて、割り当てが入れ替わっても目立たないように
      const edge = Math.min(1, (LIGHT_RANGE - n.d) / 4);
      l.intensity = n.f.base * n.k * edge;
    });

    let flash = 1;
    if (this.flashFlicker > 0) {
      this.flashFlicker -= dt;
      flash = Math.random() < 0.5 ? 0.15 : 0.8;
    }
    if ((this.strobeLeft > 0 && anyDark) || (anyDark && Math.random() < 0.3)) flash = 0.1;
    if (this.blackout) flash = 0;
    // 照らしている物が近いほど、目が慣れたように光を弱める（近くの紙が真っ白に飛んで字が消えないように）。
    // 距離による減り方とほぼ打ち消し合うので、照らした面の明るさは 1〜4m でだいたい同じになる
    const t = Math.min(1, Math.max(0, (this.nearDist - 0.3) / 3.7));
    const target = 0.06 + 0.94 * t * t;
    this.nearScale += (target - this.nearScale) * Math.min(1, dt * 6);
    this.flashlight.intensity = FLASH_INTENSITY * flash * this.nearScale;
    this.ambient.intensity = this.blackout ? 0.02 : this.ambientBase;
  }
}
