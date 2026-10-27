import type * as THREE from 'three';
import type { AudioEngine, SfxName } from '../engine/audio';
import type { CollisionWorld } from '../engine/collision';
import type { LightRig } from '../engine/lights';
import type { WorldBuilder } from '../world/builder';
import type { GameState } from './state';

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
  /** target を付けた strobe は、その名前の明かりだけを激しく明滅させる */
  | { fx: 'blackout' | 'lightsOn' | 'strobe' | 'flashFlicker' | 'shake' | 'fadeOut' | 'fadeIn'; duration?: number; target?: string }
  | { open: string }
  /** 開いた扉を閉める（当たり判定も戻る） */
  | { close: string }
  /** 扉をバタンバタンと勝手に開け閉めさせる（待たずに次へ進む）。終わると元の状態に戻る */
  | { rattle: string[]; duration?: number }
  /** builder.spawn で決めた地点へプレイヤーを移す（階の移動など） */
  | { teleport: string }
  /** カメラを名前付きの物の方へ向ける */
  | { look: string }
  /** 音名を空白区切りで並べた旋律を鳴らす（例：'ド レ ミ'） */
  | { melody: string; tempo?: number }
  /** ボタンを順に押させる入力（ピアノ・ダイヤル錠など）。やめたら何もしない */
  | { sequence: SequenceDef }
  /** ステージのコード側の動く物（actor）へ命令する */
  | { actor: string; command: string }
  | { choice: { prompt?: string; options: ChoiceOption[] } }
  | { if: Cond; then: Action[]; else?: Action[] }
  | { run: string }
  /** クリア画面へ。title / text でエンディングごとの文言を変えられる */
  | { clear: true; title?: string; text?: string }
  /** 体力を減らす。0 になると StageDef.faintScript を実行し、いまの手順は打ち切る */
  | { damage: number }
  | { heal: number }
  /** 怪異メーターを一瞬振り切らせる（0..1） */
  | { meter: number };

export interface SequenceDef {
  prompt: string;
  /** 押せるボタン */
  keys: string[];
  answer: string[];
  /** ボタンを押したときの音 */
  sound?: 'piano' | 'click';
  correct: Action[];
  wrong: Action[];
}

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

/** プレイヤーが範囲に入ったら一度だけ（once=false なら毎回）実行する */
export interface TriggerDef {
  id: string;
  area: { minX: number; maxX: number; minZ: number; maxZ: number };
  when?: Cond;
  actions: Action[];
  once?: boolean;
}

/** actor から使えるゲームの機能 */
export interface ActorContext {
  builder: WorldBuilder;
  collision: CollisionWorld;
  camera: THREE.PerspectiveCamera;
  state: GameState;
  audio: AudioEngine;
  /** プレイヤーの足元の位置 */
  playerPos: THREE.Vector3;
  /** 視線が通るか（壁に遮られないか） */
  lineOfSight(from: THREE.Vector3, to: THREE.Vector3): boolean;
  /** スクリプトを実行する（実行中なら何もしない） */
  run(actions: Action[]): void;
  /** 体力を直接減らす（会話を挟まない持続ダメージ用）。0 になると気絶する */
  damage(amount: number): void;
  /** 持続ダメージ中の画面の赤み（0..1） */
  setDrain(level: number): void;
  /** 画面上部に短い知らせを出す */
  toast(text: string): void;
}

/** データでは書きにくい動き（追いかけてくる怪異など）をコードで書く */
export interface Actor {
  /** 会話中・スクリプト実行中は呼ばれない */
  update(dt: number): void;
  command?(cmd: string): void;
  /** 怪異メーターへの寄与（0..1） */
  threat?(): number;
}

/**
 * ステージの一部（怪異 1 つ分など）。複数を mergeParts でまとめて StageDef にする。
 */
export interface StagePart {
  presences?: PresenceDef[];
  notes?: NoteDef[];
  items?: ItemDef[];
  interactables?: InteractableDef[];
  scripts?: Record<string, Action[]>;
  triggers?: TriggerDef[];
  visibility?: { id: string; when: Cond }[];
}

export function mergeParts(parts: StagePart[]): Required<StagePart> {
  const out: Required<StagePart> = { presences: [], notes: [], items: [], interactables: [], scripts: {}, triggers: [], visibility: [] };
  for (const p of parts) {
    out.presences.push(...(p.presences ?? []));
    out.notes.push(...(p.notes ?? []));
    out.items.push(...(p.items ?? []));
    out.interactables.push(...(p.interactables ?? []));
    out.triggers.push(...(p.triggers ?? []));
    out.visibility.push(...(p.visibility ?? []));
    for (const [k, v] of Object.entries(p.scripts ?? {})) {
      if (out.scripts[k]) throw new Error(`duplicate script: ${k}`);
      out.scripts[k] = v;
    }
  }
  return out;
}

export interface ActorDef {
  id: string;
  create(ctx: ActorContext): Actor;
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
  /** 調べられない物も含め、条件で見え隠れする物（builder.named の名前） */
  visibility?: { id: string; when: Cond }[];
  triggers?: TriggerDef[];
  actors?: ActorDef[];
  /** 怪異メーターを振らせる気配（近づくほど強い） */
  presences?: PresenceDef[];
  /** 体力の最大値（体力ゲージを使わないステージは省略） */
  maxHp?: number;
  /** 体力が 0 になったときに実行するスクリプト名 */
  faintScript?: string;
  /** いる階の番号（変数 floor に入る。スクリプトの条件で使う） */
  floorOf?: (x: number, z: number) => number;
}

/** 怪異の気配。半径 radius の中に入ると、近いほど strength に近い値でメーターが振れる */
export interface PresenceDef {
  id: string;
  x: number;
  z: number;
  radius: number;
  strength: number;
  when?: Cond;
}
