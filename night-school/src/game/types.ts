import type { SfxName } from '../engine/audio';
import type { LightRig } from '../engine/lights';
import type { WorldBuilder } from '../world/builder';

/**
 * ステージ（怪異）をデータで定義するための型。
 * 新しい怪異を追加するときは src/stages/<名前>/ に StageDef を 1 つ作り、
 * src/stages/index.ts に登録するだけでよい。
 */

/** フラグ条件 */
export type Cond =
  | { flag: string }
  | { notFlag: string }
  | { item: string }
  | { noItem: string }
  | { note: string }
  | { var: string; eq?: number; ne?: number; gte?: number; lt?: number }
  | { all: Cond[] }
  | { any: Cond[] }
  | { not: Cond };

/** 会話の 1 行 */
export interface Line {
  text: string;
  /** 話者名（省略時はモノローグ） */
  speaker?: string;
  /** 表示の雰囲気 */
  style?: 'normal' | 'whisper' | 'ghost' | 'system';
}

export interface ChoiceOption {
  label: string;
  when?: Cond;
  actions: Action[];
}

/** イベントで実行する命令。上から順に実行される */
export type Action =
  | { say: (string | Line)[] }
  | { note: string }
  | { flag: string; value?: boolean }
  | { setVar: string; value: number }
  | { addVar: string; value: number }
  | { give: string }
  | { take: string }
  | { sfx: SfxName }
  | { wait: number }
  | { fx: 'blackout' | 'lightsOn' | 'strobe' | 'flashFlicker' | 'shake' | 'fadeOut' | 'fadeIn'; duration?: number }
  | { open: string }
  | { choice: { prompt?: string; options: ChoiceOption[] } }
  | { if: Cond; then: Action[]; else?: Action[] }
  | { run: string }
  | { clear: true };

/** 状態ごとの反応。上から見て最初に条件を満たしたものを使う */
export interface Reaction {
  when?: Cond;
  actions: Action[];
}

export interface InteractableDef {
  /** マップ側で builder.interactable(id, …) した物と対応する */
  id: string;
  /** 照準を合わせたときに出る名前 */
  name: string;
  /** 条件によって名前を変える */
  names?: { when: Cond; name: string }[];
  /** この条件のときだけ存在する（見える・調べられる） */
  visibleWhen?: Cond;
  reactions: Reaction[];
}

export interface NoteDef {
  id: string;
  title: string;
  body: string;
}

export interface ItemDef {
  id: string;
  name: string;
}

export interface BuildContext {
  builder: WorldBuilder;
  lights: LightRig;
}

export interface StageDef {
  id: string;
  /** 例：第一話 */
  episode: string;
  title: string;
  /** 3D マップを組み立てる */
  build(ctx: BuildContext): void;
  start: { x: number; z: number; yaw: number };
  intro: Action[];
  interactables: InteractableDef[];
  notes: NoteDef[];
  items: ItemDef[];
  /** { run: 'name' } で呼べる共通の手順 */
  scripts: Record<string, Action[]>;
  /** 画面左上の目的表示（上から最初に条件を満たしたもの） */
  objectives: { when?: Cond; text: string }[];
}
