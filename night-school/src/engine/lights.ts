import * as THREE from 'three';

const FLASH_INTENSITY = 30;

export type FixtureMode = 'steady' | 'flicker' | 'dim' | 'dead';

interface Fixture {
  light: THREE.PointLight | null;
  tubeMat: THREE.MeshBasicMaterial;
  base: number;
  mode: FixtureMode;
  /** ちらつき用の内部状態 */
  timer: number;
  on: boolean;
}

/**
 * 照明の管理：懐中電灯・蛍光灯・月明かり。
 * 演出（暗転・明滅）もここで扱う。
 */
export class LightRig {
  readonly flashlight: THREE.SpotLight;
  private fixtures: Fixture[] = [];
  private blackout = false;
  private strobeLeft = 0;
  private strobeTimer = 0;
  private strobeOn = true;
  private flashFlicker = 0;
  private ambient: THREE.HemisphereLight;
  private ambientBase: number;

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
  }

  /** 天井の蛍光灯を 1 つ追加する */
  addFluorescent(x: number, y: number, z: number, mode: FixtureMode, rotY = 0, intensity = 4): void {
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

    let light: THREE.PointLight | null = null;
    const base = mode === 'dim' ? intensity * 0.45 : intensity;
    if (mode !== 'dead') {
      light = new THREE.PointLight(0xd8f0ff, base, 9, 1.8);
      light.position.set(x, y - 0.25, z);
      this.scene.add(light);
    }
    this.fixtures.push({ light, tubeMat, base, mode, timer: Math.random() * 2, on: mode !== 'dead' });
  }

  setBlackout(on: boolean): void {
    this.blackout = on;
  }

  /** 照明が明滅する演出 */
  strobe(seconds: number): void {
    this.strobeLeft = seconds;
    this.strobeTimer = 0;
  }

  /** 懐中電灯を一瞬弱める（怪異の気配） */
  flickerFlashlight(seconds: number): void {
    this.flashFlicker = seconds;
  }

  update(dt: number): void {
    if (this.strobeLeft > 0) {
      this.strobeLeft -= dt;
      this.strobeTimer -= dt;
      if (this.strobeTimer <= 0) {
        this.strobeOn = !this.strobeOn;
        this.strobeTimer = 0.03 + Math.random() * (this.strobeOn ? 0.12 : 0.08);
      }
    } else {
      this.strobeOn = true;
    }

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
      if (this.strobeLeft > 0) k = this.strobeOn ? 1.3 : 0;
      if (this.blackout) k = 0;
      if (f.light) f.light.intensity = f.base * k;
      const lit = f.mode !== 'dead' && k > 0;
      f.tubeMat.color.setHex(lit ? (f.mode === 'dim' ? 0x9fb4b8 : 0xeaffff) : 0x2a2a2a);
    }

    let flash = 1;
    if (this.flashFlicker > 0) {
      this.flashFlicker -= dt;
      flash = Math.random() < 0.5 ? 0.15 : 0.8;
    }
    if (this.strobeLeft > 0 && !this.strobeOn) flash = 0.1;
    if (this.blackout) flash = 0;
    this.flashlight.intensity = FLASH_INTENSITY * flash;
    this.ambient.intensity = this.blackout ? 0.02 : this.ambientBase;
  }
}
