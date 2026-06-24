import express from 'express'
import cors from 'cors'
import { spawn } from 'node:child_process'
import os from 'node:os'

// 本地代理：把日语句子转发给本机的 Claude Code CLI（claude -p），
// 从而使用你的 Claude 订阅额度，而不是 API 按量计费。

const PORT = process.env.PORT || 8787
const CLAUDE_BIN = process.env.CLAUDE_BIN || 'claude'
// 访问密钥：设置后，/api/analyze 与 /api/ping 必须带 x-api-token 头才放行（上线必设）
const AUTH_TOKEN = process.env.AUTH_TOKEN || ''
// 允许的前端来源：设置后只接受这些域名（逗号分隔），如 https://xxx.vercel.app
const ALLOW_ORIGIN = process.env.ALLOW_ORIGIN || ''

const app = express()
app.use(cors(ALLOW_ORIGIN ? { origin: ALLOW_ORIGIN.split(',').map((s) => s.trim()) } : undefined))
app.use(express.json({ limit: '1mb' }))

// 密钥中间件
function requireToken(req, res, next) {
  if (!AUTH_TOKEN) return next()
  const t = req.get('x-api-token') || (req.get('authorization') || '').replace(/^Bearer\s+/i, '')
  if (t === AUTH_TOKEN) return next()
  return res.status(401).json({ error: '访问密钥无效（x-api-token 不匹配）' })
}

const INSTRUCTION = `你是一位经验丰富的日语教师，向以中文为母语的学习者讲解日语句子。
请只输出一个 JSON 对象（不要任何解释、不要 Markdown 代码块），结构如下：
{
  "translation": "整句自然的简体中文翻译",
  "reading": "整句假名读音（汉字注平假名）",
  "words": [
    {"surface": "句中表层形", "reading": "假名", "lemma": "词典原形", "pos": "中文词性(如 名词/五段动词/助词/助动词/形容动词 等)", "meaning": "该语境下的中文释义", "note": "可选的用法或活用说明"}
  ],
  "grammar": [
    {"point": "语法点/句型", "explanation": "中文解释含义与用法", "example": "可选例句"}
  ],
  "structure": "用中文简要说明句子结构(主谓宾/修饰/从句等)"
}
words 按出现顺序覆盖句中实词与重要助词；所有解释一律用简体中文。`

function buildPrompt(sentence, context) {
  let p = INSTRUCTION + '\n\n要解析的句子：「' + sentence + '」'
  if (context) p += '\n上下文(仅参考)：' + context
  return p
}

function runClaude(prompt, model) {
  return new Promise((resolve, reject) => {
    // 用最通用的 `claude -p "<prompt>"` 形式；spawn 不经过 shell，特殊字符安全
    const args = ['-p', prompt, '--output-format', 'json']
    if (model) args.push('--model', model)

    const child = spawn(CLAUDE_BIN, args, {
      cwd: os.tmpdir(),
      stdio: ['ignore', 'pipe', 'pipe']
    })

    let out = ''
    let err = ''
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      reject(new Error('调用 claude 超时（90s）。首次调用可能较慢，或 claude 在等待登录/授权。'))
    }, 90000)

    child.stdout.on('data', (d) => (out += d))
    child.stderr.on('data', (d) => (err += d))
    child.on('error', (e) => {
      clearTimeout(timer)
      if (e.code === 'ENOENT') {
        reject(new Error('找不到 claude 命令。请确认已安装 Claude Code 且 `claude` 在该终端的 PATH 中（可先跑 `claude --version` 验证），或用 CLAUDE_BIN 指定完整路径。'))
      } else {
        reject(e)
      }
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (code !== 0) {
        return reject(new Error('claude 退出码 ' + code + '：' + ((err || out).trim().slice(0, 400) || '（无输出，可能未登录，试试在终端运行 `claude` 登录）')))
      }
      try {
        const parsed = JSON.parse(out)
        if (parsed.is_error) return reject(new Error('claude 返回错误：' + String(parsed.result || '').slice(0, 400)))
        resolve(parsed.result != null ? parsed.result : out)
      } catch {
        resolve(out)
      }
    })
  })
}

function extractJson(text) {
  if (typeof text !== 'string') return text
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = fence ? fence[1] : text
  const s = candidate.indexOf('{')
  const e = candidate.lastIndexOf('}')
  if (s >= 0 && e > s) {
    try { return JSON.parse(candidate.slice(s, e + 1)) } catch { /* fallthrough */ }
  }
  try { return JSON.parse(candidate) } catch { return null }
}

app.get('/api/health', (req, res) => {
  // 注意：claude 缺失时 spawn 会同时触发 error 与 close，必须防止重复响应导致进程崩溃
  let sent = false
  const reply = (payload) => {
    if (sent) return
    sent = true
    res.json(payload)
  }
  let out = ''
  try {
    const child = spawn(CLAUDE_BIN, ['--version'])
    child.stdout.on('data', (d) => (out += d))
    child.on('error', () => reply({ ok: true, claude: false }))
    child.on('close', (code) => reply({ ok: true, claude: code === 0, version: out.trim() }))
  } catch {
    reply({ ok: true, claude: false })
  }
})

// 带密钥校验的轻量探活（供前端「测试连接」用，不消耗额度）
app.get('/api/ping', requireToken, (req, res) => res.json({ ok: true }))

app.post('/api/analyze', requireToken, async (req, res) => {
  const { sentence, context = '', model } = req.body || {}
  if (!sentence || !String(sentence).trim()) {
    return res.status(400).json({ error: '缺少 sentence' })
  }
  try {
    const raw = await runClaude(buildPrompt(String(sentence), String(context || '')), model)
    const json = extractJson(raw)
    if (!json || !json.translation) {
      return res.status(502).json({ error: '无法解析模型输出', raw: String(raw).slice(0, 800) })
    }
    res.json(json)
  } catch (err) {
    const msg = String((err && err.message) || err)
    console.error('[analyze] 失败：', msg)
    res.status(500).json({ error: msg })
  }
})

// 兜底错误处理：任何中间件错误（如非法 JSON body）都返回 JSON 而非 HTML
app.use((err, req, res, _next) => {
  res.status(err.status || 500).json({ error: String((err && err.message) || err) })
})

app.listen(PORT, () => {
  console.log(`\n  日语阅读器后端已启动： http://localhost:${PORT}`)
  console.log(`  使用 Claude Code 命令： ${CLAUDE_BIN}`)
  console.log(`  健康检查： http://localhost:${PORT}/api/health`)
  console.log(`  访问密钥： ${AUTH_TOKEN ? '已启用 ✓' : '未设置（仅供本机；上线务必设 AUTH_TOKEN）'}`)
  console.log(`  允许来源： ${ALLOW_ORIGIN || '任意（建议上线时设 ALLOW_ORIGIN 限制为你的前端域名）'}\n`)
})
