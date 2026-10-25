/**
 * Web Audio API で効果音をその場で合成する（音声ファイルは使わない）。
 * ブラウザの制約で、最初のタップ／クリックの中で unlock() を呼ぶ必要がある。
 */
export type SfxName = 'step' | 'knock' | 'laugh' | 'hai' | 'creak' | 'pickup' | 'locked' | 'unlock' | 'stinger' | 'page' | 'drip';

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private reverb!: ConvolverNode;
  private reverbSend!: GainNode;
  private noiseBuf!: AudioBuffer;
  private humGain: GainNode | null = null;
  private stepToggle = false;

  unlock(): void {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(ctx.destination);

    // 校舎の残響：減衰するノイズをインパルス応答にする
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.impulse(2.6, 2.2);
    this.reverbSend = ctx.createGain();
    this.reverbSend.gain.value = 0.55;
    this.reverbSend.connect(this.reverb);
    this.reverb.connect(this.master);

    this.noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

    this.startAmbience();
    void ctx.resume();
  }

  get ready(): boolean {
    return this.ctx !== null;
  }

  /** 蛍光灯のハム音の大きさ（0..1） */
  setHum(level: number): void {
    if (this.humGain && this.ctx) this.humGain.gain.setTargetAtTime(level * 0.03, this.ctx.currentTime, 0.05);
  }

  play(name: SfxName): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime + 0.01;
    switch (name) {
      case 'step':
        return this.step(t);
      case 'knock':
        return this.knock(t);
      case 'laugh':
        return this.laugh(t);
      case 'hai':
        return this.hai(t);
      case 'creak':
        return this.creak(t);
      case 'pickup':
        return this.pickup(t);
      case 'locked':
        return this.locked(t);
      case 'unlock':
        return this.unlockSfx(t);
      case 'stinger':
        return this.stinger(t);
      case 'page':
        return this.page(t);
      case 'drip':
        return this.drip(t);
    }
  }

  // ---- 部品 ----

  private impulse(seconds: number, decay: number): AudioBuffer {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  /** 出力先：dry と reverb の両方へ送る */
  private out(wet = 0.5): AudioNode {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    g.connect(this.master);
    const s = ctx.createGain();
    s.gain.value = wet;
    g.connect(s);
    s.connect(this.reverbSend);
    return g;
  }

  private noise(t: number, dur: number, dest: AudioNode, gain: number, filter?: { type: BiquadFilterType; freq: number; q?: number }): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node: AudioNode = src;
    if (filter) {
      const f = ctx.createBiquadFilter();
      f.type = filter.type;
      f.frequency.value = filter.freq;
      f.Q.value = filter.q ?? 1;
      src.connect(f);
      node = f;
    }
    node.connect(g);
    g.connect(dest);
    src.start(t, Math.random());
    src.stop(t + dur + 0.05);
  }

  private tone(t: number, dur: number, freq: number, dest: AudioNode, gain: number, type: OscillatorType = 'sine', endFreq?: number): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (endFreq) o.frequency.exponentialRampToValueAtTime(endFreq, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(dest);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  // ---- 環境音 ----

  private startAmbience(): void {
    const ctx = this.ctx!;
    // 低いうなり
    const drone = ctx.createGain();
    drone.gain.value = 0.045;
    drone.connect(this.master);
    for (const f of [55, 55.7, 82.4]) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      o.connect(drone);
      o.start();
    }
    // 窓の外の風
    const wind = ctx.createBufferSource();
    wind.buffer = this.noiseBuf;
    wind.loop = true;
    const wf = ctx.createBiquadFilter();
    wf.type = 'bandpass';
    wf.frequency.value = 400;
    wf.Q.value = 0.7;
    const wg = ctx.createGain();
    wg.gain.value = 0.02;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoG = ctx.createGain();
    lfoG.gain.value = 250;
    lfo.connect(lfoG);
    lfoG.connect(wf.frequency);
    lfo.start();
    wind.connect(wf);
    wf.connect(wg);
    wg.connect(this.master);
    wind.start();
    // 蛍光灯のハム
    const hum = ctx.createOscillator();
    hum.type = 'sawtooth';
    hum.frequency.value = 100;
    const hf = ctx.createBiquadFilter();
    hf.type = 'lowpass';
    hf.frequency.value = 600;
    this.humGain = ctx.createGain();
    this.humGain.gain.value = 0;
    hum.connect(hf);
    hf.connect(this.humGain);
    this.humGain.connect(this.master);
    hum.start();
  }

  // ---- 効果音 ----

  private step(t: number): void {
    this.stepToggle = !this.stepToggle;
    const out = this.out(0.35);
    this.noise(t, 0.09, out, 0.12, { type: 'lowpass', freq: this.stepToggle ? 700 : 800, q: 0.8 });
    this.tone(t, 0.06, this.stepToggle ? 90 : 80, out, 0.12);
  }

  private knock(t: number): void {
    const out = this.out(0.6);
    this.tone(t, 0.12, 170, out, 0.6, 'sine', 90);
    this.noise(t, 0.05, out, 0.35, { type: 'bandpass', freq: 1800, q: 1.2 });
    this.tone(t, 0.18, 320, out, 0.08, 'triangle', 280);
  }

  /** 子どもの笑い声：短い「ふふ」「くすくす」を声道フィルタで */
  private laugh(t: number): void {
    const ctx = this.ctx!;
    const out = this.out(0.9);
    const pan = ctx.createStereoPanner();
    pan.pan.value = Math.random() * 1.6 - 0.8;
    pan.connect(out);
    const n = 7 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) {
      const st = t + i * (0.13 + Math.random() * 0.05);
      const f0 = 520 + Math.sin(i * 1.3) * 60 + (n - i) * 10;
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(f0 * 1.1, st);
      o.frequency.exponentialRampToValueAtTime(f0 * 0.85, st + 0.11);
      const f1 = ctx.createBiquadFilter();
      f1.type = 'bandpass';
      f1.frequency.value = 900;
      f1.Q.value = 6;
      const f2 = ctx.createBiquadFilter();
      f2.type = 'bandpass';
      f2.frequency.value = 2400;
      f2.Q.value = 8;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, st);
      g.gain.linearRampToValueAtTime(0.55, st + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, st + 0.12);
      o.connect(f1);
      o.connect(f2);
      f1.connect(g);
      f2.connect(g);
      g.connect(pan);
      o.start(st);
      o.stop(st + 0.15);
      // 息の成分
      this.noise(st, 0.08, pan, 0.07, { type: 'highpass', freq: 3000 });
    }
  }

  /** 「はあい」：h のノイズ → 母音 a → i に滑らせる */
  private hai(t: number): void {
    const ctx = this.ctx!;
    const out = this.out(1.0);
    this.noise(t, 0.12, out, 0.12, { type: 'bandpass', freq: 1500, q: 0.8 });
    const st = t + 0.08;
    const dur = 0.95;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(360, st);
    o.frequency.linearRampToValueAtTime(390, st + 0.25);
    o.frequency.linearRampToValueAtTime(300, st + dur);
    // ビブラート
    const vib = ctx.createOscillator();
    vib.frequency.value = 5.5;
    const vg = ctx.createGain();
    vg.gain.value = 6;
    vib.connect(vg);
    vg.connect(o.frequency);
    const formant = (fa: number, fi: number, q: number, gain: number) => {
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.Q.value = q;
      f.frequency.setValueAtTime(fa, st);
      f.frequency.setValueAtTime(fa, st + 0.45);
      f.frequency.linearRampToValueAtTime(fi, st + 0.7);
      const g = ctx.createGain();
      g.gain.value = gain;
      o.connect(f);
      f.connect(g);
      return g;
    };
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, st);
    env.gain.linearRampToValueAtTime(0.9, st + 0.06);
    env.gain.setValueAtTime(0.8, st + 0.45);
    env.gain.linearRampToValueAtTime(0.35, st + 0.55);
    env.gain.linearRampToValueAtTime(0.6, st + 0.7);
    env.gain.exponentialRampToValueAtTime(0.001, st + dur);
    formant(850, 300, 7, 1).connect(env);
    formant(1250, 2500, 9, 0.6).connect(env);
    formant(2900, 3200, 10, 0.25).connect(env);
    env.connect(out);
    o.start(st);
    vib.start(st);
    o.stop(st + dur + 0.1);
    vib.stop(st + dur + 0.1);
  }

  private creak(t: number): void {
    const ctx = this.ctx!;
    const out = this.out(0.7);
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    const dur = 1.6;
    o.frequency.setValueAtTime(70, t);
    for (let i = 1; i < 16; i++) o.frequency.linearRampToValueAtTime(60 + Math.random() * 90 + i * 4, t + (dur * i) / 16);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 1100;
    f.Q.value = 5;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.35, t + 0.2);
    g.gain.setValueAtTime(0.3, t + dur - 0.3);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(f);
    f.connect(g);
    g.connect(out);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private pickup(t: number): void {
    const out = this.out(0.6);
    this.tone(t, 0.5, 1318, out, 0.12, 'triangle');
    this.tone(t + 0.09, 0.7, 1760, out, 0.1, 'triangle');
    this.noise(t, 0.04, out, 0.08, { type: 'highpass', freq: 5000 });
  }

  private locked(t: number): void {
    const out = this.out(0.4);
    for (let i = 0; i < 3; i++) {
      this.noise(t + i * 0.09, 0.06, out, 0.3, { type: 'bandpass', freq: 2200 + i * 200, q: 3 });
      this.tone(t + i * 0.09, 0.05, 240, out, 0.2, 'square', 160);
    }
  }

  private unlockSfx(t: number): void {
    const out = this.out(0.5);
    this.noise(t, 0.08, out, 0.3, { type: 'bandpass', freq: 3000, q: 2 });
    this.tone(t + 0.12, 0.12, 400, out, 0.25, 'square', 200);
    this.noise(t + 0.12, 0.1, out, 0.35, { type: 'bandpass', freq: 1500, q: 2 });
  }

  /** 不協和音のショック */
  private stinger(t: number): void {
    const out = this.out(0.9);
    for (const f of [92.5, 98, 146.8, 155.6, 311]) this.tone(t, 2.2, f, out, 0.08, 'sawtooth', f * 0.97);
    this.noise(t, 1.5, out, 0.12, { type: 'lowpass', freq: 900 });
  }

  private page(t: number): void {
    const out = this.out(0.2);
    this.noise(t, 0.18, out, 0.15, { type: 'highpass', freq: 2500 });
    this.noise(t + 0.1, 0.12, out, 0.1, { type: 'bandpass', freq: 4000 });
  }

  private drip(t: number): void {
    const out = this.out(0.9);
    this.tone(t, 0.12, 1400, out, 0.12, 'sine', 600);
  }
}
