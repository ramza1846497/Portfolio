// 架空の商品データ。価格は税込の整数（円）。棚の場所は world/store.js の SHELF_SECTIONS が持つ。

export const BOX_SIZE = 6;

export const PRODUCTS = Object.freeze([
  { id: 'onigiri_sake', name: '鮭おにぎり', category: 'おにぎり', price: 150, cost: 95, color: 0xf06e5a },
  { id: 'onigiri_tuna', name: 'ツナマヨおにぎり', category: 'おにぎり', price: 140, cost: 88, color: 0xf2d16b },
  { id: 'melonpan', name: 'メロンパン', category: 'パン', price: 160, cost: 100, color: 0xb8d86b },
  { id: 'currypan', name: 'カレーパン', category: 'パン', price: 170, cost: 105, color: 0xc98b3c },
  { id: 'tea', name: '緑茶', category: '飲料', price: 140, cost: 80, color: 0x4fa36b },
  { id: 'water', name: '天然水', category: '飲料', price: 110, cost: 55, color: 0x7fc4f0 },
  { id: 'juice', name: 'オレンジジュース', category: '飲料', price: 150, cost: 85, color: 0xf59a2c },
  { id: 'latte', name: 'カフェラテ', category: '飲料', price: 180, cost: 105, color: 0x9b6b4a },
  { id: 'chips', name: 'ポテトチップス', category: 'お菓子', price: 160, cost: 95, color: 0xe94b4b },
  { id: 'choco', name: 'チョコレート', category: 'お菓子', price: 120, cost: 70, color: 0x6b3f2a },
  { id: 'battery', name: '乾電池', category: '日用品', price: 380, cost: 240, color: 0x3b5bd6 },
  { id: 'towel', name: 'ハンドタオル', category: '日用品', price: 330, cost: 200, color: 0xd98ad6 },
]);

export const PRODUCT_BY_ID = Object.freeze(Object.fromEntries(PRODUCTS.map((p) => [p.id, p])));

// ホットスナック。fryTime は揚げ時間（現実の秒）
export const FRY_BATCH = 4;

export const HOTSNACKS = Object.freeze([
  { id: 'karaage', name: 'からあげ', price: 220, cost: 90, fryTime: 15, color: 0xc7772c },
  { id: 'potato', name: 'フライドポテト', price: 180, cost: 60, fryTime: 15, color: 0xf0c94a },
  { id: 'croquette', name: 'コロッケ', price: 120, cost: 45, fryTime: 15, color: 0xb98a4a },
]);

export const SNACK_BY_ID = Object.freeze(Object.fromEntries(HOTSNACKS.map((s) => [s.id, s])));
