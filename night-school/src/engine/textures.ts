import * as THREE from 'three';

/**
 * canvas で描いたテクスチャ。外部画像は使わない。
 * 乱数は固定シードなので、毎回同じ見た目になる。
 */

let seed = 12345;
function rand(): number {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
}

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  return [c, ctx];
}

function toTexture(c: HTMLCanvasElement, repeat = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) {
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
  }
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

/** 汚れ・ムラを上から重ねる */
function grime(ctx: CanvasRenderingContext2D, w: number, h: number, amount: number, dark = true): void {
  for (let i = 0; i < amount; i++) {
    const x = rand() * w;
    const y = rand() * h;
    const r = 2 + rand() * (w / 10);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const a = 0.03 + rand() * 0.06;
    g.addColorStop(0, dark ? `rgba(20,15,10,${a})` : `rgba(255,255,240,${a})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
}

function speckle(ctx: CanvasRenderingContext2D, w: number, h: number, n: number, alpha: number): void {
  for (let i = 0; i < n; i++) {
    const v = rand() < 0.5 ? 0 : 255;
    ctx.fillStyle = `rgba(${v},${v},${v},${alpha * rand()})`;
    ctx.fillRect(rand() * w, rand() * h, 1 + rand() * 2, 1 + rand() * 2);
  }
}

const cache = new Map<string, THREE.Texture>();
function cached(key: string, make: () => THREE.Texture): THREE.Texture {
  let t = cache.get(key);
  if (!t) {
    t = make();
    cache.set(key, t);
  }
  return t;
}

/** 廊下・教室の床：くすんだ長尺シート（1 枚 = 2m 四方） */
export function floorTexture(): THREE.Texture {
  return cached('floor', () => {
    const [c, ctx] = makeCanvas(256, 256);
    ctx.fillStyle = '#6f6a5c';
    ctx.fillRect(0, 0, 256, 256);
    speckle(ctx, 256, 256, 3000, 0.25);
    grime(ctx, 256, 256, 40);
    ctx.strokeStyle = 'rgba(30,25,20,0.5)';
    ctx.lineWidth = 2;
    for (let i = 0; i <= 256; i += 128) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, 256);
      ctx.moveTo(0, i);
      ctx.lineTo(256, i);
      ctx.stroke();
    }
    return toTexture(c);
  });
}

/** 教室の床：板張り */
export function woodFloorTexture(): THREE.Texture {
  return cached('woodfloor', () => {
    const [c, ctx] = makeCanvas(256, 256);
    const boards = 8;
    for (let i = 0; i < boards; i++) {
      const l = 70 + rand() * 25;
      ctx.fillStyle = `hsl(28, 35%, ${l * 0.4}%)`;
      ctx.fillRect(0, (i * 256) / boards, 256, 256 / boards);
      for (let k = 0; k < 30; k++) {
        ctx.strokeStyle = `rgba(40,20,10,${0.05 + rand() * 0.1})`;
        ctx.beginPath();
        const y = (i * 256) / boards + rand() * (256 / boards);
        ctx.moveTo(0, y);
        ctx.bezierCurveTo(80, y + rand() * 3, 160, y - rand() * 3, 256, y);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(10,5,0,0.6)';
      ctx.fillRect(0, (i * 256) / boards, 256, 1.5);
      const off = rand() * 256;
      ctx.fillRect(off, (i * 256) / boards, 1.5, 256 / boards);
    }
    grime(ctx, 256, 256, 30);
    return toTexture(c);
  });
}

/** 壁：上はクリーム色の塗り壁、下 0.9m は腰壁（テクスチャ 1 枚 = 幅2m×高さ3m） */
export function wallTexture(): THREE.Texture {
  return cached('wall', () => {
    const [c, ctx] = makeCanvas(256, 384);
    ctx.fillStyle = '#b9b29c';
    ctx.fillRect(0, 0, 256, 384);
    speckle(ctx, 256, 384, 2500, 0.12);
    grime(ctx, 256, 384, 60);
    // 腰壁（下 0.9m = 115px）
    const wain = 384 - 115;
    ctx.fillStyle = '#5b6b5e';
    ctx.fillRect(0, wain, 256, 115);
    speckle(ctx, 256, 115, 600, 0.15);
    ctx.fillStyle = '#3a3a30';
    ctx.fillRect(0, wain - 4, 256, 5);
    ctx.fillStyle = '#2a2a22';
    ctx.fillRect(0, 384 - 10, 256, 10);
    // 垂れた染み
    for (let i = 0; i < 6; i++) {
      const x = rand() * 256;
      const len = 30 + rand() * 120;
      const g = ctx.createLinearGradient(0, 0, 0, len);
      g.addColorStop(0, 'rgba(60,50,30,0.18)');
      g.addColorStop(1, 'rgba(60,50,30,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x, 0, 2 + rand() * 6, len);
    }
    return toTexture(c);
  });
}

/** トイレの壁：白い小さなタイル（1 枚 = 1.2m 四方） */
export function tileTexture(color = '#c9d0cc'): THREE.Texture {
  return cached('tile' + color, () => {
    const [c, ctx] = makeCanvas(256, 256);
    ctx.fillStyle = '#6d726c';
    ctx.fillRect(0, 0, 256, 256);
    const n = 8;
    const s = 256 / n;
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.85 + rand() * 0.15;
        ctx.fillRect(x * s + 1.5, y * s + 1.5, s - 3, s - 3);
      }
    }
    ctx.globalAlpha = 1;
    grime(ctx, 256, 256, 70);
    // ひび
    ctx.strokeStyle = 'rgba(30,30,30,0.4)';
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      let x = rand() * 256;
      let y = rand() * 256;
      ctx.moveTo(x, y);
      for (let k = 0; k < 6; k++) {
        x += (rand() - 0.5) * 30;
        y += rand() * 20;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    return toTexture(c);
  });
}

/** 天井：吸音ボード（1 枚 = 1m 四方） */
export function ceilingTexture(): THREE.Texture {
  return cached('ceiling', () => {
    const [c, ctx] = makeCanvas(128, 128);
    ctx.fillStyle = '#a7a597';
    ctx.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 400; i++) {
      ctx.fillStyle = 'rgba(60,55,45,0.5)';
      ctx.fillRect(rand() * 128, rand() * 128, 1.5, 1);
    }
    ctx.strokeStyle = 'rgba(40,40,30,0.6)';
    ctx.strokeRect(0.5, 0.5, 127, 127);
    grime(ctx, 128, 128, 10);
    return toTexture(c);
  });
}

/** 木目（扉・机の天板） */
export function woodTexture(): THREE.Texture {
  return cached('wood', () => {
    const [c, ctx] = makeCanvas(128, 128);
    ctx.fillStyle = '#7a5532';
    ctx.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 60; i++) {
      ctx.strokeStyle = `rgba(50,25,10,${0.08 + rand() * 0.15})`;
      ctx.beginPath();
      const x = rand() * 128;
      ctx.moveTo(x, 0);
      ctx.bezierCurveTo(x + rand() * 6 - 3, 40, x + rand() * 6 - 3, 90, x, 128);
      ctx.stroke();
    }
    grime(ctx, 128, 128, 10);
    return toTexture(c);
  });
}

/** 塗装した金属（個室の仕切り・扉、用具入れ） */
export function paintedMetalTexture(color: string): THREE.Texture {
  return cached('metal' + color, () => {
    const [c, ctx] = makeCanvas(128, 128);
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 128, 128);
    speckle(ctx, 128, 128, 500, 0.12);
    grime(ctx, 128, 128, 25);
    // 錆
    for (let i = 0; i < 8; i++) {
      ctx.fillStyle = `rgba(110,50,20,${0.1 + rand() * 0.2})`;
      ctx.beginPath();
      ctx.arc(rand() * 128, rand() * 128, 1 + rand() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
    return toTexture(c);
  });
}

/** 窓の外：夜空と月、遠くの山並み */
export function nightWindowTexture(): THREE.Texture {
  return cached('night', () => {
    const [c, ctx] = makeCanvas(256, 256);
    const g = ctx.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, '#0a1228');
    g.addColorStop(0.7, '#1b2a4a');
    g.addColorStop(1, '#2a3550');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 60; i++) {
      ctx.fillStyle = `rgba(220,230,255,${rand() * 0.6})`;
      ctx.fillRect(rand() * 256, rand() * 170, 1, 1);
    }
    // 霧
    const fog = ctx.createLinearGradient(0, 150, 0, 256);
    fog.addColorStop(0, 'rgba(120,140,170,0)');
    fog.addColorStop(1, 'rgba(120,140,170,0.35)');
    ctx.fillStyle = fog;
    ctx.fillRect(0, 150, 256, 106);
    ctx.fillStyle = '#05070d';
    ctx.beginPath();
    ctx.moveTo(0, 256);
    for (let x = 0; x <= 256; x += 16) ctx.lineTo(x, 200 + Math.sin(x * 0.05) * 12 + rand() * 8);
    ctx.lineTo(256, 256);
    ctx.fill();
    return toTexture(c, false);
  });
}

/** 黒板。lines を手書き風のチョークで書く */
export function blackboardTexture(key: string, lines: string[], options: { small?: string[] } = {}): THREE.Texture {
  return cached('bb' + key, () => {
    const [c, ctx] = makeCanvas(1024, 384);
    ctx.fillStyle = '#1f3a2c';
    ctx.fillRect(0, 0, 1024, 384);
    // 消し跡
    for (let i = 0; i < 40; i++) {
      ctx.fillStyle = `rgba(200,210,200,${0.02 + rand() * 0.04})`;
      ctx.fillRect(rand() * 1024, rand() * 384, 60 + rand() * 200, 20 + rand() * 40);
    }
    ctx.fillStyle = 'rgba(235,235,225,0.88)';
    ctx.textBaseline = 'top';
    ctx.font = '48px "Hiragino Mincho ProN", "Yu Mincho", "Noto Serif JP", serif';
    lines.forEach((line, i) => {
      ctx.save();
      ctx.translate(70, 60 + i * 72);
      ctx.rotate((rand() - 0.5) * 0.03);
      ctx.fillText(line, 0, 0);
      ctx.restore();
    });
    if (options.small) {
      ctx.font = '26px sans-serif';
      ctx.fillStyle = 'rgba(235,235,225,0.6)';
      options.small.forEach((s, i) => ctx.fillText(s, 840, 40 + i * 34));
    }
    // 木枠
    ctx.strokeStyle = '#4a3420';
    ctx.lineWidth = 16;
    ctx.strokeRect(0, 0, 1024, 384);
    return toTexture(c, false);
  });
}

/** 掲示板（コルク）と貼り紙 */
export function bulletinTexture(): THREE.Texture {
  return cached('bulletin', () => {
    const [c, ctx] = makeCanvas(512, 320);
    ctx.fillStyle = '#9c7445';
    ctx.fillRect(0, 0, 512, 320);
    speckle(ctx, 512, 320, 3000, 0.3);
    // 貼り紙たち
    const papers: [number, number, number, number, string, string[]][] = [
      [20, 30, 150, 110, '#ddd8c4', ['保健だより', '手洗い・うがい']],
      [30, 170, 130, 120, '#d8c9a4', ['図書室より', '返却期限を', 'まもりましょう']],
    ];
    for (const [x, y, w, h, col, text] of papers) {
      ctx.fillStyle = col;
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = '#333';
      ctx.font = '16px sans-serif';
      text.forEach((t, i) => ctx.fillText(t, x + 10, y + 26 + i * 22));
    }
    // 七不思議の貼り紙（赤字）
    ctx.save();
    ctx.translate(200, 22);
    ctx.rotate(0.02);
    ctx.fillStyle = '#e8e2cf';
    ctx.fillRect(0, 0, 280, 280);
    ctx.fillStyle = '#7a0d0d';
    ctx.font = 'bold 30px serif';
    ctx.fillText('学校の七不思議', 30, 42);
    ctx.font = '18px serif';
    ctx.fillStyle = '#222';
    const items = ['一、トイレの花子さん', '二、動く人体模型', '三、音楽室のピアノ', '四、十三階段', '五、……', '六、……', '七、知ってはいけない'];
    items.forEach((t, i) => ctx.fillText(t, 26, 82 + i * 28));
    ctx.fillStyle = 'rgba(120,10,10,0.4)';
    ctx.beginPath();
    ctx.arc(200, 82, 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    // 画鋲
    ctx.fillStyle = '#c33';
    for (const [x, y] of [[205, 28], [470, 32], [90, 34], [92, 174]]) {
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = '#5a3c1c';
    ctx.lineWidth = 12;
    ctx.strokeRect(0, 0, 512, 320);
    return toTexture(c, false);
  });
}

/** 文字だけの札（教室札など） */
export function signTexture(text: string, bg = '#e6e2d3', fg = '#222'): THREE.Texture {
  return cached('sign' + text + bg, () => {
    const [c, ctx] = makeCanvas(256, 96);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 256, 96);
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 6;
    ctx.strokeRect(3, 3, 250, 90);
    ctx.fillStyle = fg;
    ctx.font = 'bold 48px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 128, 50);
    return toTexture(c, false);
  });
}

/** 一枚の紙（教卓のメモなど） */
export function paperTexture(key: string, lines: string[]): THREE.Texture {
  return cached('paper' + key, () => {
    const [c, ctx] = makeCanvas(256, 192);
    ctx.fillStyle = '#e9e4d2';
    ctx.fillRect(0, 0, 256, 192);
    grime(ctx, 256, 192, 20);
    ctx.strokeStyle = 'rgba(80,100,160,0.25)';
    for (let y = 30; y < 192; y += 24) {
      ctx.beginPath();
      ctx.moveTo(10, y);
      ctx.lineTo(246, y);
      ctx.stroke();
    }
    ctx.fillStyle = '#2a2a2a';
    ctx.font = '18px serif';
    lines.forEach((l, i) => ctx.fillText(l, 16, 26 + i * 24));
    return toTexture(c, false);
  });
}
