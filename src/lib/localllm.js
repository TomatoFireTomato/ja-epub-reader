import { ref } from 'vue'

// 本地通用模型（Qwen2.5-0.5B）的主线程封装：管理 Worker、下载进度、文本生成。
export const llmState = ref({ status: 'idle', progress: 0, file: '', error: '' })
// status: idle | loading | ready | error

let worker = null
let reqId = 0
const pending = new Map()
let readyResolve = null
let readyReject = null
let readyPromise = null

function ensureWorker() {
  if (worker) return worker
  worker = new Worker(import.meta.env.BASE_URL + 'llm-worker.js', { type: 'module' })
  worker.onmessage = (ev) => {
    const m = ev.data || {}
    if (m.type === 'progress') {
      const p = m.data || {}
      if (p.status === 'progress' && p.total) {
        llmState.value = { status: 'loading', file: p.file || '', progress: Math.round((p.loaded / p.total) * 100), error: '' }
      } else if (p.status === 'download' || p.status === 'initiate') {
        llmState.value = { ...llmState.value, status: 'loading', file: p.file || llmState.value.file }
      }
    } else if (m.type === 'ready') {
      llmState.value = { status: 'ready', progress: 100, file: '', error: '' }
      if (readyResolve) { readyResolve(); readyResolve = readyReject = null }
    } else if (m.type === 'result') {
      const r = pending.get(m.id)
      if (r) { pending.delete(m.id); r.resolve(m.text) }
    } else if (m.type === 'error') {
      if (m.id != null) {
        const r = pending.get(m.id)
        if (r) { pending.delete(m.id); r.reject(new Error(m.error)) }
      } else {
        llmState.value = { ...llmState.value, status: 'error', error: m.error }
        if (readyReject) { readyReject(new Error(m.error)); readyResolve = readyReject = null }
      }
    }
  }
  worker.onerror = (e) => {
    llmState.value = { ...llmState.value, status: 'error', error: e.message || 'Worker 出错' }
    if (readyReject) { readyReject(new Error(llmState.value.error)); readyResolve = readyReject = null }
  }
  return worker
}

// 触发模型下载/加载（显式点按时调用）
export function loadModel() {
  ensureWorker()
  if (llmState.value.status === 'ready') return Promise.resolve()
  if (readyPromise && llmState.value.status === 'loading') return readyPromise
  llmState.value = { status: 'loading', progress: 0, file: '', error: '' }
  readyPromise = new Promise((resolve, reject) => { readyResolve = resolve; readyReject = reject })
  worker.postMessage({ type: 'load' })
  return readyPromise
}

export function llmReady() { return llmState.value.status === 'ready' }

// 生成（不自动下载：模型未就绪时明确报错，由用户在设置里显式下载，避免点词时静默拉 483MB 卡住）
export function llmGenerate(system, user) {
  if (llmState.value.status !== 'ready') {
    const msg = llmState.value.status === 'loading'
      ? `本地模型仍在下载/加载中（${llmState.value.progress || 0}%），请稍候…`
      : '本地模型未加载。请在「设置 → 本地大模型」里点「下载/加载模型」，完成后再用。'
    return Promise.reject(new Error(msg))
  }
  ensureWorker()
  const id = ++reqId
  const p = new Promise((resolve, reject) => pending.set(id, { resolve, reject }))
  worker.postMessage({ type: 'generate', id, system, user })
  return p
}
