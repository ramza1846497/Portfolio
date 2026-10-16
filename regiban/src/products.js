// 架空の商品データ（税込・円）

export const PRODUCTS = Object.freeze([
  { id: 'onigiri', name: 'おにぎり', emoji: '🍙', price: 150 },
  { id: 'coffee', name: 'ホットコーヒー', emoji: '☕', price: 120 },
  { id: 'karaage', name: 'からあげ', emoji: '🍗', price: 238 },
  { id: 'juice', name: 'ジュース', emoji: '🧃', price: 98 },
  { id: 'nikuman', name: '肉まん', emoji: '🥟', price: 180 },
  { id: 'magazine', name: '雑誌', emoji: '📰', price: 550 },
  { id: 'bento', name: 'のり弁当', emoji: '🍱', price: 498 },
  { id: 'sandwich', name: 'サンドイッチ', emoji: '🥪', price: 328 },
  { id: 'pudding', name: 'プリン', emoji: '🍮', price: 165 },
  { id: 'icecream', name: 'ソフトクリーム', emoji: '🍦', price: 143 },
  { id: 'water', name: '天然水', emoji: '💧', price: 108 },
  { id: 'candy', name: 'あめ玉', emoji: '🍬', price: 32 },
  { id: 'umbrella', name: 'ビニール傘', emoji: '☂️', price: 700 },
  { id: 'melonpan', name: 'メロンパン', emoji: '🍞', price: 162 },
  { id: 'battery', name: '乾電池', emoji: '🔋', price: 437 },
  { id: 'tea', name: 'お茶', emoji: '🍵', price: 140 },
]);

export function pickProducts(rng, count) {
  return Array.from({ length: count }, () => rng.pick(PRODUCTS));
}

export function sumPrices(items) {
  return items.reduce((sum, item) => sum + item.price, 0);
}
