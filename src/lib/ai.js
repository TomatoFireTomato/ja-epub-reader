import { settings } from '../store.js'

// 给中文母语学习者讲解日语的系统提示词
export const SYSTEM_PROMPT = `你是一位经验丰富的日语教师，擅长向以中文为母语的学习者讲解日语句子。
你会收到一句（或一小段）日语原文，请完成：
1. translation：整句自然、地道的简体中文翻译。
2. reading：整句的假名读音（汉字用平假名注音，可含分词空格）。
3. words：逐词拆解。按出现顺序列出句中的实词与重要助词/助动词，每个词给出：
   - surface 表层形（句中原样）
   - reading 假名读音
   - lemma 词典原形（动词、形容词等还原为基本形）
   - pos 词性（用中文，如 名词/五段动词/一段动词/サ变动词/助词/助动词/副词/形容词/形容动词/连体词/接续词/感叹词 等）
   - meaning 在该句语境下的中文释义
   - note 可选，用法或活用说明
4. grammar：句中出现的语法点/句型（如 ～ている、～なければならない、使役、被动、敬语 等），用中文解释含义与用法。
5. structure：用中文简要说明句子结构（主谓宾、修饰关系、从句等）。
所有解释一律使用简体中文。不要输出与解析无关的内容。`

// 用于 OpenAI 兼容接口（DeepSeek）的 JSON 输出说明
export const JSON_SCHEMA_INSTRUCTION = `请只输出一个 JSON 对象（不要任何额外文字、不要 Markdown 代码块），结构如下：
{
  "translation": "整句中文翻译",
  "reading": "整句假名读音",
  "words": [{"surface":"表层形","reading":"假名","lemma":"词典原形","pos":"中文词性","meaning":"中文释义","note":"可选"}],
  "grammar": [{"point":"语法点","explanation":"中文解释","example":"可选"}],
  "structure": "中文结构说明"
}`

// 强制结构化输出的工具定义（API 模式用）
export const ANALYSIS_TOOL = {
  name: 'report_analysis',
  description: '返回对日语句子的结构化解析结果',
  input_schema: {
    type: 'object',
    properties: {
      translation: { type: 'string', description: '整句中文翻译' },
      reading: { type: 'string', description: '整句假名读音' },
      words: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            surface: { type: 'string' },
            reading: { type: 'string' },
            lemma: { type: 'string' },
            pos: { type: 'string' },
            meaning: { type: 'string' },
            note: { type: 'string' }
          },
          required: ['surface', 'meaning']
        }
      },
      grammar: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            point: { type: 'string' },
            explanation: { type: 'string' },
            example: { type: 'string' }
          },
          required: ['point', 'explanation']
        }
      },
      structure: { type: 'string' }
    },
    required: ['translation', 'words']
  }
}

function userText(sentence, context) {
  let t = '请解析下面这句日语：\n\n「' + sentence + '」'
  if (context) t += '\n\n（上下文，仅供参考：' + context + '）'
  return t
}

// 统一入口：按设置选择「本地订阅」/「Anthropic API Key」/「DeepSeek」模式
export async function analyzeSentence(sentence, context = '') {
  const cfg = settings.value
  if (cfg.mode === 'apikey') return callAnthropicDirect(sentence, context, cfg)
  if (cfg.mode === 'deepseek') return callDeepSeek(sentence, context, cfg)
  return callLocalServer(sentence, context, cfg)
}

// 模式三：DeepSeek（OpenAI 兼容接口，浏览器可直连，用 JSON 模式输出）
async function callDeepSeek(sentence, context, cfg) {
  if (!cfg.deepseekKey) throw new Error('请先在「设置」中填写 DeepSeek API Key')
  const base = (cfg.deepseekBaseUrl || 'https://api.deepseek.com').replace(/\/$/, '')
  const res = await fetch(base + '/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: 'Bearer ' + cfg.deepseekKey
    },
    body: JSON.stringify({
      model: cfg.deepseekModel || 'deepseek-chat',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT + '\n\n' + JSON_SCHEMA_INSTRUCTION },
        { role: 'user', content: userText(sentence, context) }
      ],
      response_format: { type: 'json_object' },
      max_tokens: 2000,
      temperature: 0.3,
      stream: false
    })
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error('DeepSeek 请求失败（' + res.status + '）：' + detail.slice(0, 300))
  }
  const data = await res.json()
  const content = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content
  if (!content) throw new Error('DeepSeek 未返回内容')
  let parsed
  try {
    parsed = JSON.parse(content)
  } catch {
    const m = content.match(/\{[\s\S]*\}/)
    if (m) { try { parsed = JSON.parse(m[0]) } catch { /* ignore */ } }
  }
  if (!parsed || !parsed.translation) throw new Error('无法解析 DeepSeek 输出：' + String(content).slice(0, 200))
  return parsed
}

// 模式一：浏览器直连 Anthropic API（用 API Key / 按量计费）
async function callAnthropicDirect(sentence, context, cfg) {
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
      max_tokens: 2000,
      system: SYSTEM_PROMPT,
      tools: [ANALYSIS_TOOL],
      tool_choice: { type: 'tool', name: ANALYSIS_TOOL.name },
      messages: [{ role: 'user', content: userText(sentence, context) }]
    })
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error('API 请求失败（' + res.status + '）：' + detail.slice(0, 300))
  }
  const data = await res.json()
  const tool = (data.content || []).find((c) => c.type === 'tool_use')
  if (!tool) throw new Error('模型未返回结构化结果')
  return tool.input
}

// 后端地址：留空 = 走本机 /api 代理；上线时填隧道 https 地址
function localBase() {
  return (settings.value.serverUrl || '').trim().replace(/\/$/, '')
}
function localHeaders() {
  const h = { 'content-type': 'application/json' }
  const t = (settings.value.serverToken || '').trim()
  if (t) h['x-api-token'] = t
  return h
}

// 模式二：本地 Claude Code 服务（用订阅额度）
async function callLocalServer(sentence, context, cfg) {
  let res
  try {
    res = await fetch(localBase() + '/api/analyze', {
      method: 'POST',
      headers: localHeaders(),
      body: JSON.stringify({ sentence, context, model: cfg.model })
    })
  } catch (e) {
    const where = localBase() || '`npm run server`（本机 8787）'
    throw new Error('连不到后端：' + where + '。本地用请确认服务在跑；上线用请检查设置里的后端地址；或改用 API Key 模式。')
  }
  if (!res.ok) {
    // 优先解析后端返回的 JSON 错误；空响应体几乎都是代理连不到后端
    let detail = ''
    try {
      const data = await res.clone().json()
      detail = data.error || JSON.stringify(data)
    } catch {
      detail = (await res.text().catch(() => '')).trim()
    }
    if (!detail) {
      throw new Error(
        '连不到本地服务（HTTP ' + res.status + '）。多半是 `npm run server` 没在运行，' +
        '请用 `npm run dev:all` 同时启动前后端，或单独运行 `npm run server`。'
      )
    }
    throw new Error('本地服务报错：' + detail.slice(0, 400))
  }
  return res.json()
}

// 测试连接（设置页用）
export async function testConnection() {
  const cfg = settings.value
  if (cfg.mode === 'local') {
    const base = localBase()
    const res = await fetch(base + '/api/health').catch(() => null)
    if (!res || !res.ok) {
      throw new Error('连不到后端（' + (base || '本机 /api') + '）。本地用先跑 `npm run server`；上线用请填写下面的后端地址。')
    }
    const data = await res.json()
    if (!data.claude) throw new Error('后端在线，但未检测到 claude 命令，请确认该机器已安装 Claude Code 并登录订阅')
    // 若配置了密钥，校验它是否正确
    const t = (cfg.serverToken || '').trim()
    if (t) {
      const pong = await fetch(base + '/api/ping', { headers: localHeaders() }).catch(() => null)
      if (!pong || !pong.ok) throw new Error('后端可达，但访问密钥不正确')
    }
    return '后端正常' + (t ? '，密钥校验通过' : '')
  }
  // API 模式（Anthropic / DeepSeek）：发一个最小请求验证
  await analyzeSentence('これはテストです。')
  return cfg.mode === 'deepseek' ? 'DeepSeek 可用' : 'Anthropic API Key 可用'
}
