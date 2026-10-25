import type { StageDef } from '../../game/types';
import { interactables, items, notes, objectives, scripts } from './data';
import { buildHanakoMap } from './map';

/** 第一話「トイレの花子さん」 */
export const hanakoStage: StageDef = {
  id: 'hanako',
  episode: '第一話',
  title: 'トイレの花子さん',
  build: buildHanakoMap,
  start: { x: 41.5, z: 0, yaw: Math.PI / 2 },
  intro: [{ run: 'intro' }],
  interactables,
  notes,
  items,
  scripts,
  objectives,
};
