// 画面中央（照準）の先にある物を調べる。

import * as THREE from 'three';

const REACH = 2.4;

export function createInteractor(camera) {
  const raycaster = new THREE.Raycaster();
  raycaster.far = REACH;
  const center = new THREE.Vector2(0, 0);
  const hits = [];

  // いちばん手前に当たった物の target（操作できない物に遮られたら null）
  function pick(objects) {
    raycaster.setFromCamera(center, camera);
    hits.length = 0;
    raycaster.intersectObjects(objects, false, hits);
    for (const h of hits) return h.object.userData.target ?? null;
    return null;
  }

  return { pick };
}
