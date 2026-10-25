import { defineConfig } from 'vite';

export default defineConfig({
  // 相対パスで出力して、どこに置いても dist/ をそのまま開けるようにする
  base: './',
  server: { host: true },
  // three.js 本体だけで 500kB を超えるため
  build: { chunkSizeWarningLimit: 1000 },
});
