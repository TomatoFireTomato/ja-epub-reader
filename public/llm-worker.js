// 本地通用模型 Worker：在浏览器用 transformers.js + WebGPU 跑 Qwen2.5-0.5B-Instruct。
// 从 CDN 加载 transformers.js（避免打包巨型库 + WASM）。模型首次下载 ~483MB，浏览器缓存后复用。

const MODEL_ID = 'onnx-community/Qwen2.5-0.5B-Instruct'
const CDN = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3'

let generator = null
let loading = null

async function getGenerator() {
  if (generator) return generator
  if (loading) return loading
  loading = (async () => {
    const { pipeline, env } = await import(CDN)
    env.allowLocalModels = false // 只从 HF 远程拉
    const progress = (p) => self.postMessage({ type: 'progress', data: p })
    // 优先 WebGPU + q4f16；不支持则回退 WASM + q8
    try {
      generator = await pipeline('text-generation', MODEL_ID, {
        dtype: 'q4f16', device: 'webgpu', progress_callback: progress
      })
    } catch (e) {
      self.postMessage({ type: 'info', data: 'WebGPU 不可用，回退到 WASM（较慢）' })
      generator = await pipeline('text-generation', MODEL_ID, {
        dtype: 'q8', device: 'wasm', progress_callback: progress
      })
    }
    return generator
  })()
  return loading
}

async function generate(system, user, id) {
  try {
    const gen = await getGenerator()
    const messages = [
      { role: 'system', content: system || '' },
      { role: 'user', content: user || '' }
    ]
    const out = await gen(messages, { max_new_tokens: 320, do_sample: false, temperature: 0 })
    // text-generation 返回完整对话，取最后一条 assistant 内容
    let text = ''
    const g = out && out[0] && out[0].generated_text
    if (Array.isArray(g)) text = (g[g.length - 1] && g[g.length - 1].content) || ''
    else if (typeof g === 'string') text = g
    self.postMessage({ type: 'result', id, text: String(text).trim() })
  } catch (e) {
    self.postMessage({ type: 'error', id, error: String((e && e.message) || e) })
  }
}

self.onmessage = (ev) => {
  const m = ev.data || {}
  if (m.type === 'load') getGenerator().then(() => self.postMessage({ type: 'ready' })).catch((e) => self.postMessage({ type: 'error', error: String((e && e.message) || e) }))
  else if (m.type === 'generate') generate(m.system, m.user, m.id)
}
