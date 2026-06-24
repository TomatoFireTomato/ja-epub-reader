import { settings } from '../store.js'

// 从模型回复文本里提取 JSON 对象
function extractJson(text) {
  if (text && typeof text === 'object') return text
  if (typeof text !== 'string') return null
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const cand = fence ? fence[1] : text
  const s = cand.indexOf('{')
  const e = cand.lastIndexOf('}')
  if (s >= 0 && e > s) {
    try { return JSON.parse(cand.slice(s, e + 1)) } catch { /* ignore */ }
  }
  try { return JSON.parse(cand) } catch { return null }
}

function localBase() {
  return (settings.value.serverUrl || '').trim().replace(/\/$/, '')
}
function localHeaders() {
  const h = { 'content-type': 'application/json' }
  const t = (settings.value.serverToken || '').trim()
  if (t) h['x-api-token'] = t
  return h
}

// ---------- provider 无关的一次补全：给定 system + user，返回模型文本 ----------
async function complete(system, user) {
  const cfg = settings.value
  if (cfg.mode === 'apikey') return completeAnthropic(system, user, cfg)
  if (cfg.mode === 'deepseek') return completeDeepSeek(system, user, cfg)
  return completeLocal(system, user, cfg)
}

async function completeJson(system, user) {
  const text = await complete(system, user)
  const json = extractJson(text)
  if (!json) throw new Error('无法解析模型输出：' + String(text).slice(0, 200))
  return json
}

// Anthropic（浏览器直连，订阅之外按量）
async function completeAnthropic(system, user, cfg) {
  if (!cfg.apiKey) throw new Error('请先在「设置」中填写 Anthropic API Key')
  const base = (cfg.baseUrl || 'https://api.anthropic.com').replace(/\/$/, '')
  const res = await fetch(base + '/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': cfg.apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({
      model: cfg.model,
      max_tokens: 1500,
      system,
      messages: [{ role: 'user', content: user }]
    })
  })
  if (!res.ok) throw new Error('Anthropic 请求失败（' + res.status + '）：' + (await res.text().catch(() => '')).slice(0, 200))
  const data = await res.json()
  return (data.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('')
}

// DeepSeek（OpenAI 兼容，浏览器可直连）
async function completeDeepSeek(system, user, cfg) {
  if (!cfg.deepseekKey) throw new Error('请先在「设置」中填写 DeepSeek API Key')
  const base = (cfg.deepseekBaseUrl || 'https://api.deepseek.com').replace(/\/$/, '')
  const res = await fetch(base + '/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + cfg.deepseekKey },
    body: JSON.stringify({
      model: cfg.deepseekModel || 'deepseek-chat',
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      response_format: { type: 'json_object' },
      temperature: 0.3,
      max_tokens: 1500,
      stream: false
    })
  })
  if (!res.ok) throw new Error('DeepSeek 请求失败（' + res.status + '）：' + (await res.text().catch(() => '')).slice(0, 200))
  const data = await res.json()
  return data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content
}

// 本地 Claude Code 服务（订阅额度）
async function completeLocal(system, user, cfg) {
  let res
  try {
    res = await fetch(localBase() + '/api/complete', {
      method: 'POST',
      headers: localHeaders(),
      body: JSON.stringify({ system, user, model: cfg.model })
    })
  } catch (e) {
    throw new Error('连不到后端。本地请运行 `npm run server`；上线请在设置里填后端地址；或改用 API Key / DeepSeek 模式。')
  }
  if (!res.ok) {
    let d = ''
    try { d = (await res.clone().json()).error || '' } catch { d = (await res.text().catch(() => '')).trim() }
    if (!d) throw new Error('连不到本地服务（HTTP ' + res.status + '）。请确认 `npm run server` 在运行。')
    throw new Error('本地服务报错：' + d.slice(0, 300))
  }
  const data = await res.json()
  return data.text
}

// ---------- 四个小任务（按需调用，省 token） ----------

// 第一步：分词 + 语法点识别（只识别，不解释）
const SEG_SYSTEM = `你是日语教师。请对给定日语句子做分词与语法点识别，只识别、不要解释。
只输出 JSON：{"words":[{"surface":"句中表层形","reading":"假名","pos":"简短中文词性"}],"grammar":[{"point":"语法点/句型名，如 ～ている、～なければならない、被动 等"}]}
words 按出现顺序覆盖实词与重要助词/助动词；grammar 列出值得讲解的语法点，没有则空数组。只输出 JSON，不要多余内容。`

export function segmentSentence(sentence) {
  return completeJson(SEG_SYSTEM, `句子：「${sentence}」`)
}

// 第二步之一：单词详情
const WORD_SYSTEM = `你是日语教师，向中文母语学习者讲解。给定句子和其中一个词，只解释这一个词。
只输出 JSON：{"reading":"假名","lemma":"词典原形","pos":"中文词性","meaning":"该语境下的中文释义","note":"用法或活用说明(可选)"}
用简体中文，只输出 JSON。`

export function explainWord(sentence, surface) {
  return completeJson(WORD_SYSTEM, `句子：「${sentence}」\n要解释的词：「${surface}」`)
}

// 第二步之二：语法点详情
const GRAMMAR_SYSTEM = `你是日语教师，向中文母语学习者讲解。给定句子和其中一个语法点，解释它。
只输出 JSON：{"explanation":"中文解释其含义与用法","example":"简短例句(可选)"}
用简体中文，只输出 JSON。`

export function explainGrammar(sentence, point) {
  return completeJson(GRAMMAR_SYSTEM, `句子：「${sentence}」\n语法点：「${point}」`)
}

// 第二步之三：整句翻译
const TRANSLATE_SYSTEM = `你是日语翻译。把给定日语句子翻译成自然的简体中文，并给出整句假名读音。
只输出 JSON：{"translation":"中文翻译","reading":"整句假名读音"}
只输出 JSON。`

export function translateSentence(sentence) {
  return completeJson(TRANSLATE_SYSTEM, `句子：「${sentence}」`)
}

// ---------- 测试连接（设置页用） ----------
export async function testConnection() {
  const cfg = settings.value
  if (cfg.mode === 'local') {
    const base = localBase()
    const res = await fetch(base + '/api/health').catch(() => null)
    if (!res || !res.ok) {
      throw new Error('连不到后端（' + (base || '本机 /api') + '）。本地用先跑 `npm run server`；上线用请填写后端地址。')
    }
    const data = await res.json()
    if (!data.claude) throw new Error('后端在线，但未检测到 claude 命令，请确认该机器已安装 Claude Code 并登录订阅')
    const t = (cfg.serverToken || '').trim()
    if (t) {
      const pong = await fetch(base + '/api/ping', { headers: localHeaders() }).catch(() => null)
      if (!pong || !pong.ok) throw new Error('后端可达，但访问密钥不正确')
    }
    return '后端正常' + (t ? '，密钥校验通过' : '')
  }
  await segmentSentence('これはテストです。')
  return cfg.mode === 'deepseek' ? 'DeepSeek 可用' : 'Anthropic API Key 可用'
}
