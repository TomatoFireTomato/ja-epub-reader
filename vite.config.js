import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// Vite 配置：开发时把 /api 代理到本地 Claude Code 服务（订阅模式）。
// 构建时用相对 base（'./'），以便部署到 GitHub Pages 的 /<repo>/ 子路径下资源正确加载。
export default defineConfig(({ command }) => ({
  base: command === 'build' ? './' : '/',
  plugins: [vue()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8787',
        changeOrigin: true
      }
    }
  }
}))
