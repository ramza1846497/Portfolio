import type { AudioEngine } from '../engine/audio';
import type { LightRig } from '../engine/lights';
import type { Dialogue } from '../ui/dialogue';
import type { Hud } from '../ui/hud';
import type { Keypad } from '../ui/keypad';
import type { GameState } from './state';
import type { Action, InteractableDef, Line } from './types';

/** スクリプト実行に必要なゲーム側の機能 */
export interface RunnerHost {
  state: GameState;
  dialogue: Dialogue;
  audio: AudioEngine;
  lights: LightRig;
  hud: Hud;
  keypad: Keypad;
  /** 開閉する物を開く */
  open(name: string): void;
  /** spawn 地点へプレイヤーを移す */
  teleport(spawn: string): void;
  /** カメラを物の方へ向ける（向き終わるまで待つ） */
  look(name: string): Promise<void>;
  actorCommand(id: string, command: string): void;
  /** 画面を揺らす */
  shake(): void;
  /** クリア画面へ */
  clear(title?: string, text?: string): void;
  /** ダメージを受けた演出 */
  hurt(amount: number): void;
  /** 怪異メーターを一瞬振らせる */
  meterSpike(level: number): void;
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * データで書かれた Action 列を順番に実行する。
 * 実行中は busy になり、プレイヤーは動けない。
 */
export class ScriptRunner {
  busy = false;
  onBusyChange: ((busy: boolean) => void) | null = null;

  constructor(private host: RunnerHost) {}

  /** 調べられる物の反応を選んで実行する */
  async interact(def: InteractableDef): Promise<void> {
    const r = def.reactions.find((x) => this.host.state.test(x.when));
    if (!r) return;
    await this.start(r.actions);
  }

  async start(actions: Action[]): Promise<void> {
    if (this.busy) return;
    this.setBusy(true);
    try {
      await this.run(actions);
    } finally {
      this.host.dialogue.hide();
      this.setBusy(false);
    }
  }

  private setBusy(b: boolean): void {
    this.busy = b;
    this.onBusyChange?.(b);
  }

  /** true を返したら、呼び出し元の手順もすべて打ち切る（クリア・気絶） */
  private async run(actions: Action[]): Promise<boolean> {
    for (const a of actions) {
      if (await this.exec(a)) return true;
    }
    return false;
  }

  /** true を返すと以降を打ち切る */
  private async exec(a: Action): Promise<boolean> {
    const { state, dialogue, audio, lights, hud } = this.host;
    const stage = state.stage;

    if ('say' in a) {
      for (const l of a.say) {
        const line: Line = typeof l === 'string' ? { text: l } : { ...l };
        // {変数名} を現在の値に置き換える
        line.text = line.text.replace(/\{(\w+)\}/g, (_, v: string) => String(state.getVar(v)));
        await dialogue.line(line);
      }
    } else if ('note' in a) {
      if (state.addNote(a.note)) {
        const n = stage.notes.find((x) => x.id === a.note)!;
        audio.play('page');
        hud.toast(`手帳に記録した：${n.title}`);
      }
    } else if ('flag' in a) {
      state.setFlag(a.flag, a.value ?? true);
    } else if ('setVar' in a) {
      state.setVar(a.setVar, a.value);
    } else if ('addVar' in a) {
      state.setVar(a.addVar, state.getVar(a.addVar) + a.value);
    } else if ('give' in a) {
      state.give(a.give);
      const item = stage.items.find((x) => x.id === a.give);
      hud.toast(`「${item?.name ?? a.give}」を手に入れた`);
    } else if ('take' in a) {
      state.take(a.take);
    } else if ('sfx' in a) {
      audio.play(a.sfx);
    } else if ('wait' in a) {
      await wait(a.wait);
    } else if ('fx' in a) {
      const ms = (a.duration ?? 1) * 1000;
      switch (a.fx) {
        case 'blackout':
          lights.setBlackout(true);
          audio.setHum(0);
          break;
        case 'lightsOn':
          lights.setBlackout(false);
          audio.setHum(1);
          break;
        case 'strobe':
          lights.strobe(ms / 1000);
          break;
        case 'flashFlicker':
          lights.flickerFlashlight(ms / 1000);
          break;
        case 'shake':
          this.host.shake();
          break;
        case 'fadeOut':
          hud.fade.style.transitionDuration = `${ms}ms`;
          hud.fade.style.opacity = '1';
          await wait(ms);
          break;
        case 'fadeIn':
          hud.fade.style.transitionDuration = `${ms}ms`;
          hud.fade.style.opacity = '0';
          await wait(ms);
          break;
      }
    } else if ('open' in a) {
      this.host.open(a.open);
    } else if ('teleport' in a) {
      this.host.teleport(a.teleport);
    } else if ('look' in a) {
      await this.host.look(a.look);
    } else if ('melody' in a) {
      const beat = 60000 / (a.tempo ?? 132);
      for (const n of a.melody.split(/\s+/).filter(Boolean)) {
        // 「-」は休符
        if (n !== '-') audio.note(n);
        await wait(beat);
      }
    } else if ('sequence' in a) {
      const q = a.sequence;
      const got = await this.host.keypad.ask(q.prompt, q.keys, q.answer.length, q.sound ?? 'click');
      if (got) {
        const ok = got.every((k, i) => k === q.answer[i]);
        return this.run(ok ? q.correct : q.wrong);
      }
    } else if ('actor' in a) {
      this.host.actorCommand(a.actor, a.command);
    } else if ('choice' in a) {
      const options = a.choice.options.filter((o) => state.test(o.when));
      const i = await dialogue.choose(
        options.map((o) => o.label),
        a.choice.prompt,
      );
      return this.run(options[i].actions);
    } else if ('if' in a) {
      return this.run(state.test(a.if) ? a.then : (a.else ?? []));
    } else if ('run' in a) {
      const script = stage.scripts[a.run];
      if (!script) throw new Error(`unknown script: ${a.run}`);
      return this.run(script);
    } else if ('clear' in a) {
      this.host.clear(a.title, a.text);
      return true;
    } else if ('damage' in a) {
      const max = stage.maxHp ?? 100;
      const hp = Math.max(0, state.getVar('hp') - a.damage);
      state.setVar('hp', hp);
      this.host.hurt(a.damage / max);
      if (hp <= 0 && stage.faintScript) {
        await this.run(stage.scripts[stage.faintScript] ?? []);
        return true;
      }
    } else if ('heal' in a) {
      const max = stage.maxHp ?? 100;
      state.setVar('hp', Math.min(max, state.getVar('hp') + a.heal));
    } else if ('meter' in a) {
      this.host.meterSpike(a.meter);
    }
    return false;
  }
}
