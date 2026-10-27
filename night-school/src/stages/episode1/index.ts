import { mergeParts, type StageDef } from '../../game/types';
import { common, objectives } from './data/common';
import { hanako } from './data/hanako';
import { model } from './data/model';
import { nurse } from './data/nurse';
import { outside } from './data/outside';
import { piano } from './data/piano';
import { stairs } from './data/stairs';
import { OZ, buildFloor1 } from './floor1';
import { buildFloor2 } from './floor2';
import { clerkActor } from './clerk';
import { modelActor } from './model';
import { buildOutside, ZO } from './outside';

const parts = mergeParts([common, stairs, model, piano, hanako, nurse, outside]);

/** 第一話「トイレの花子さん」：七不思議のうち五つが現れる一夜 */
export const episode1: StageDef = {
  id: 'episode1',
  episode: '第一話',
  title: 'トイレの花子さん',
  build: (ctx) => {
    buildFloor2(ctx);
    buildFloor1(ctx);
    buildOutside(ctx);
  },
  start: { x: 40, z: 0, yaw: Math.PI / 2 },
  intro: [{ run: 'intro' }],
  ...parts,
  objectives,
  actors: [modelActor, clerkActor],
  maxHp: 100,
  faintScript: 'faint',
  // 2 = 2 階、1 = 1 階、0 = 校舎の外
  floorOf: (_x, z) => (z > (OZ + ZO) / 2 ? 0 : z > OZ / 2 ? 1 : 2),
};
