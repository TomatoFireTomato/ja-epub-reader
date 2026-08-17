import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectDir = dirname(fileURLToPath(import.meta.url))
const kuromojiDictDir = resolve(projectDir, 'node_modules/@sglkc/kuromoji/dict')
const buildVersion = (process.env.GITHUB_SHA || Date.now().toString(36)).slice(0, 12)

// 生产构建把 Kuromoji 词典作为同源静态资源发布，避免移动端受第三方 CDN
// 速度、跨域策略或地区网络影响。开发环境仍直接使用包内 CDN，保持热更新轻量。
const kuromojiDictionary = {
  name: 'kuromoji-dictionary',
  apply: 'build',
  generateBundle() {
    for (const fileName of readdirSync(kuromojiDictDir).filter((name) => name.endsWith('.gz'))) {
      this.emitFile({
        type: 'asset',
        fileName: `dict/${fileName}`,
        source: readFileSync(resolve(kuromojiDictDir, fileName))
      })
    }
  }
}

const releaseVersion = {
  name: 'release-version',
  generateBundle() {
    this.emitFile({
      type: 'asset',
      fileName: 'version.json',
      source: JSON.stringify({ version: buildVersion })
    })
  }
}

// Vite 配置：开发时把 /api 代理到本地 Claude Code 服务（订阅模式）。
// 构建时用相对 base（'./'），以便部署到 GitHub Pages 的 /<repo>/ 子路径下资源正确加载。
export default defineConfig(({ command }) => ({
  base: command === 'build' ? './' : '/',
  define: {
    __APP_BUILD_VERSION__: JSON.stringify(buildVersion)
  },
  plugins: [vue(), kuromojiDictionary, releaseVersion],
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
