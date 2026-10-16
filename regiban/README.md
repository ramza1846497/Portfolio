# レジ番！まいにちマート

架空のコンビニ「まいにちマート」のレジで、120秒のシフト中に次々来る客へお釣りを渡すブラウザゲーム。
素の HTML / CSS / JavaScript（ES Modules）のみで、外部ライブラリやビルドは使いません。

## 遊び方

ES Modules を使うので、簡易サーバー経由で開きます。

```
cd regiban
npx serve .            # または python3 -m http.server
```

## テスト

```
cd regiban
node --test
```

## 構成

| ファイル | 役割 |
|---|---|
| `src/money.js` | お釣り計算・最小枚数・判定（純粋関数） |
| `src/rng.js` | シード付き乱数（mulberry32） |
| `src/products.js` | 商品データ |
| `src/customers.js` | 客タイプ6種の定義と生成 |
| `src/game.js` | ゲーム進行・タイマー・スコア（DOM非依存） |
| `src/ui.js` | 画面描画と入力 |
| `src/storage.js` | ハイスコア保存（localStorage、失敗しても動く） |
| `src/main.js` | 起動・画面遷移 |
