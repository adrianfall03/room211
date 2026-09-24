import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `npm run build` 生成一个完全自包含的 dist/index.html（双击即可在浏览器中游玩）
export default defineConfig({
  base: './',
  plugins: [viteSingleFile()],
  // 关闭热刷新：改代码时不会打断正在进行的游戏（手动刷新即可看到最新版本）
  server: { hmr: false },
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 4000,
    assetsInlineLimit: 100000000,
  },
});
