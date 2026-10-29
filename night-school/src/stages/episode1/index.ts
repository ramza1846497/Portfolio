import { mergeParts, type StageDef } from '../../game/types';
import { combat, combatHints, tutorials } from './data/combat';
import { common, objectives } from './data/common';
import { hanako } from './data/hanako';
import { model } from './data/model';
import { nurse } from './data/nurse';
import { houses } from './data/houses';
import { outside } from './data/outside';
import { piano } from './data/piano';
import { stairs } from './data/stairs';
import { wing } from './data/wing';
import { OZ, buildFloor1 } from './floor1';
import { buildFloor2 } from './floor2';
import { clerkActor } from './clerk';
import { buildHouses, ZH, ZM } from './houses';
import { modelActor } from './model';
import { movies } from './movies';
import { shinaiMesh } from './props';
import { buildOutside, ZO } from './outside';
import { buildWing } from './wing';

const parts = mergeParts([common, combat, stairs, model, wing, piano, hanako, nurse, outside, houses]);

/** 第一話「トイレの花子さん」：七不思議のうち五つが現れる一夜 */
export const episode1: StageDef = {
  id: 'episode1',
  episode: '第一話',
  title: 'トイレの花子さん',
  build: (ctx) => {
    buildFloor2(ctx);
    buildFloor1(ctx);
    buildWing(ctx);
    buildOutside(ctx);
    buildHouses(ctx);
  },
  start: { x: 40, z: 0, yaw: Math.PI / 2 },
  intro: [{ run: 'intro' }],
  ...parts,
  objectives,
  actors: [modelActor, clerkActor],
  maxHp: 100,
  weaponItem: 'shinai',
  tutorials,
  combatHints,
  movies,
  weaponMesh: shinaiMesh,
  faintScript: 'faint',
  // 2 = 2 階、1 = 1 階、0 = 校舎の外、3 = 花子さんの家のあたり、4 = 自分の家のあたり
  floorOf: (x, z) => (z > (ZH + ZM) / 2 ? 4 : z > (ZO + ZH) / 2 ? 3 : z > (OZ + ZO) / 2 ? 0 : z > OZ + 9.4 || (z > OZ + 1.6 && x > 22.3 && x < 24.5) ? 5 : z > OZ / 2 ? 1 : 2),
};
