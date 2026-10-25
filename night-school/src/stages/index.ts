import type { StageDef } from '../game/types';
import { hanakoStage } from './hanako';

/** 遊べるステージの一覧。新しい怪異はここに足す */
export const stages: StageDef[] = [hanakoStage];
