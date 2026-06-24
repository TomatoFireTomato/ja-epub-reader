import { ref, watch } from 'vue'

// 全局设置与生词本，持久化到 localStorage。

const SETTINGS_KEY = 'ja-reader-settings'
const VOCAB_KEY = 'ja-reader-vocab'

const DEFAULT_SETTINGS = {
  mode: 'local', // 'local'（订阅额度）| 'apikey'（Anthropic）| 'deepseek'
  apiKey: '',
  baseUrl: '',
  // 本地订阅模式：后端地址（留空=本机 /api 代理；上线时填隧道 https 地址）与访问密钥
  serverUrl: '',
  serverToken: '',
  model: 'claude-sonnet-4-6',
  // DeepSeek（OpenAI 兼容，浏览器可直连）
  deepseekKey: '',
  deepseekModel: 'deepseek-chat',
  deepseekBaseUrl: '',
  // 阅读排版
  fontSize: 20,
  lineHeight: 1.95,
  theme: 'sepia', // light | sepia | dark
  vertical: false,
  maxWidth: 760
}

export const MODELS = [
  { value: 'claude-opus-4-8', label: 'Opus 4.8（最强，较慢）' },
  { value: 'claude-sonnet-4-6', label: 'Sonnet 4.6（推荐，均衡）' },
  { value: 'claude-haiku-4-5', label: 'Haiku 4.5（最快，便宜）' }
]

export const DEEPSEEK_MODELS = [
  { value: 'deepseek-chat', label: 'deepseek-chat（V3，推荐）' },
  { value: 'deepseek-reasoner', label: 'deepseek-reasoner（R1，推理更强、更慢）' }
]

function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return structuredClone(fallback)
    const parsed = JSON.parse(raw)
    return Array.isArray(fallback) ? parsed : { ...fallback, ...parsed }
  } catch {
    return structuredClone(fallback)
  }
}

function save(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)) } catch { /* 忽略配额错误 */ }
}

export const settings = ref(load(SETTINGS_KEY, DEFAULT_SETTINGS))
watch(settings, (v) => save(SETTINGS_KEY, v), { deep: true })

export const vocab = ref(load(VOCAB_KEY, []))
watch(vocab, (v) => save(VOCAB_KEY, v), { deep: true })

export function addVocab(word) {
  const key = (word.surface || '') + '|' + (word.reading || '')
  if (vocab.value.some((w) => (w.surface || '') + '|' + (w.reading || '') === key)) return false
  vocab.value.unshift({ ...word, addedAt: Date.now() })
  return true
}

export function removeVocab(index) {
  vocab.value.splice(index, 1)
}

export function isInVocab(word) {
  const key = (word.surface || '') + '|' + (word.reading || '')
  return vocab.value.some((w) => (w.surface || '') + '|' + (w.reading || '') === key)
}

export function exportVocab() {
  return vocab.value
    .map((w) => [w.surface, w.reading, w.meaning].filter(Boolean).join('\t'))
    .join('\n')
}
