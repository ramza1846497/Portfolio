/**
 * 画質の設定。タイトル画面で選び、端末に覚えておく。
 *  high   : 懐中電灯の影（1024）・隅の陰・光のにじみ・フィルムの粒子・色味
 *  normal : 影を軽く（512）、隅の陰とにじみは小さな画像で計算
 *  low    : 影なし・にじみなし（色味と周辺減光だけ）、解像度も下げる
 */
export type Quality = 'high' | 'normal' | 'low';

export interface QualitySettings {
  pixelRatio: number;
  /** 懐中電灯の影の解像度（0 で影なし） */
  shadowSize: number;
  /** 光のにじみ（ブルーム）を計算する画像の縮小率（0 でなし） */
  bloomScale: number;
  /** フィルムの粒子・色ずれ */
  film: boolean;
  /** 隅や物の接地面の陰（アンビエントオクルージョン）。'half' は半分の解像度で計算 */
  ao: 'full' | 'half' | 'off';
}

export const QUALITY_LABELS: Record<Quality, string> = { high: '高', normal: '標準', low: '低' };

export function qualitySettings(q: Quality): QualitySettings {
  switch (q) {
    case 'high':
      return { pixelRatio: 1.75, shadowSize: 1024, bloomScale: 0.5, film: true, ao: 'full' };
    case 'normal':
      return { pixelRatio: 1.5, shadowSize: 512, bloomScale: 0.25, film: true, ao: 'half' };
    case 'low':
      return { pixelRatio: 1, shadowSize: 0, bloomScale: 0, film: false, ao: 'off' };
  }
}

const KEY = 'night-school.quality';

export function loadQuality(isTouch: boolean): Quality {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'high' || v === 'normal' || v === 'low') return v;
  } catch {
    // 保存できない環境では毎回おすすめの値
  }
  return isTouch ? 'normal' : 'high';
}

export function saveQuality(q: Quality): void {
  try {
    localStorage.setItem(KEY, q);
  } catch {
    // 保存できなくても遊べる
  }
}
