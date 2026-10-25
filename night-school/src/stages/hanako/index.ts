import type { StageDef } from '../../game/types';
import { buildHanakoMap } from './map';

/** 第一話「トイレの花子さん」 */
export const hanakoStage: StageDef = {
  id: 'hanako',
  episode: '第一話',
  title: 'トイレの花子さん',
  build: buildHanakoMap,
  start: { x: 41.5, z: 0, yaw: Math.PI / 2 },
  intro: [],
  interactables: [
    { id: 'exit', name: '昇降口の扉', reactions: [] },
    { id: 'barricade', name: '積まれた机', reactions: [] },
    { id: 'window', name: '窓', reactions: [] },
    { id: 'board', name: '掲示板', reactions: [] },
    { id: 'blackboard2a', name: '2-Aの黒板', reactions: [] },
    { id: 'podium2a', name: '2-Aの教卓', reactions: [] },
    { id: 'memo2a', name: '教卓のメモ', reactions: [] },
    { id: 'blackboard2b', name: '2-Bの黒板', reactions: [] },
    { id: 'podium2b', name: '2-Bの教卓', reactions: [] },
    { id: 'stall1', name: '個室（1番目）', reactions: [] },
    { id: 'stall2', name: '個室（2番目）', reactions: [] },
    { id: 'stall3', name: '個室（3番目）', reactions: [] },
    { id: 'stall4', name: '個室（4番目）', reactions: [] },
    { id: 'mirror', name: '鏡', reactions: [] },
    { id: 'sink', name: '洗面台', reactions: [] },
    { id: 'locker', name: '用具入れ', reactions: [] },
    { id: 'key', name: '鍵', visibleWhen: { flag: 'keyAppeared' }, reactions: [] },
  ],
  notes: [],
  items: [],
  scripts: {},
  objectives: [{ text: '校舎から出る' }],
};
