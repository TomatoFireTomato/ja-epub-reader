// 本地通用模型 Worker：浏览器用 transformers.js + WebGPU 跑 Qwen2.5-0.5B-Instruct。
// 仅支持 WebGPU（WASM 跑 0.5B 太重、易卡死）。模型首次下载 ~483MB，浏览器缓存后复用。

const MODEL_ID = 'onnx-community/Qwen2.5-0.5B-Instruct'
const CDN = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3'

let generator = null
let loading = null

async function getGenerator() {
  if (generator) return generator
  if (loading) return loading
  loading = (async () => {
    if (!navigator.gpu) {
      throw new Error('当前浏览器不支持 WebGPU，无法运行本地模型（需 Chrome / Edge 113+，且未禁用 WebGPU）。')
    }
    const { pipeline, env } = await import(CDN)
    env.allowLocalModels = false

    // 节流进度，避免高频消息卡住主线程
    let last = 0
    const progress = (p) => {
      if (p && p.status === 'progress') {
        const now = Date.now()
        if (now - last < 250) return
        last = now
      }
      self.postMessage({ type: 'progress', data: p })
    }

    generator = await pipeline('text-generation', MODEL_ID, {
      dtype: 'q4f16',
      device: 'webgpu',
      progress_callback: progress
    })
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
    const out = await gen(messages, { max_new_tokens: 200, do_sample: false })
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
  if (m.type === 'load') {
    getGenerator()
      .then(() => self.postMessage({ type: 'ready' }))
      .catch((e) => self.postMessage({ type: 'error', error: String((e && e.message) || e) }))
  } else if (m.type === 'generate') {
    generate(m.system, m.user, m.id)
  }
}
