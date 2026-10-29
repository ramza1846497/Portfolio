// n8ao には型定義がないので、使う所だけ書いておく
declare module 'n8ao' {
  import type * as THREE from 'three';
  export class N8AOPass {
    constructor(scene: THREE.Scene, camera: THREE.Camera, width?: number, height?: number);
    renderToScreen: boolean;
    configuration: Record<string, unknown>;
    setSize(width: number, height: number): void;
    dispose(): void;
    render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget | null, readBuffer: THREE.WebGLRenderTarget | null, deltaTime: number, maskActive: boolean): void;
  }
}
