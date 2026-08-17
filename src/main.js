import { createApp } from 'vue'
import App from './App.vue'
import './style.css'

const buildVersion = __APP_BUILD_VERSION__

async function refreshStaleBuild() {
  if (import.meta.env.DEV) return
  try {
    const versionUrl = new URL('version.json', document.baseURI)
    versionUrl.searchParams.set('_', Date.now().toString())
    const response = await fetch(versionUrl, { cache: 'no-store' })
    if (!response.ok) return
    const latest = await response.json()
    if (!latest?.version || latest.version === buildVersion) return

    const target = new URL(window.location.href)
    // 防止托管/CDN 异常返回旧 HTML 时反复刷新。
    if (target.searchParams.get('v') === latest.version) return
    target.searchParams.set('v', latest.version)
    window.location.replace(target.href)
  } catch {
    // 离线阅读时不打断当前页面；恢复网络或重新回到页面后会再次检查。
  }
}

refreshStaleBuild()
window.addEventListener('pageshow', refreshStaleBuild)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') refreshStaleBuild()
})

createApp(App).mount('#app')
