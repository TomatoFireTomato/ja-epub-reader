// 用 kuromoji 给汉字自动加注音（振り仮名）。
// - 只处理不在 <ruby> 里的文本，EPUB 本身的注音不受影响。
// - 「送り仮名」模式：注音只盖汉字部分（食べる → 食[た]べる）。
// - 自动加的 ruby 带 class="auto-ruby"，便于关闭时移除而不动原生 ruby。

const KANJI = /[㐀-鿿豈-﫿々]/
const hasKanji = (s) => KANJI.test(s || '')
const isKana = (c) => /[ぁ-んゔァ-ヶー]/.test(c)
const kataToHira = (s) => (s || '').replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))

// 去掉与读音公共的假名前后缀，定位真正需要注音的汉字核心
function rubyParts(surface, reading) {
  if (!hasKanji(surface) || !reading || reading === surface) return null
  let i = 0
  while (i < surface.length && i < reading.length && surface[i] === reading[i] && isKana(surface[i])) i++
  let j = 0
  while (
    j < surface.length - i && j < reading.length - i &&
    surface[surface.length - 1 - j] === reading[reading.length - 1 - j] && isKana(surface[surface.length - 1 - j])
  ) j++
  const core = surface.slice(i, surface.length - j)
  const coreReading = reading.slice(i, reading.length - j)
  if (!core || !hasKanji(core) || !coreReading) return null
  return { pre: surface.slice(0, i), core, coreReading, post: surface.slice(surface.length - j) }
}

const SKIP = new Set(['RUBY', 'RT', 'RP', 'SCRIPT', 'STYLE'])
const taskVersions = new WeakMap()
let worker = null
let workerRequestId = 0
const workerRequests = new Map()

function nextTaskVersion(root) {
  const version = (taskVersions.get(root) || 0) + 1
  taskVersions.set(root, version)
  return version
}

function isCurrentTask(root, version) {
  return taskVersions.get(root) === version
}

function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(resolve))
}

function getWorker() {
  if (worker) return worker
  worker = new Worker(new URL('./furigana-worker.js', import.meta.url), { type: 'module' })
  worker.onmessage = ({ data }) => {
    const request = workerRequests.get(data?.id)
    if (!request) return
    workerRequests.delete(data.id)
    if (data.error) request.reject(new Error(data.error))
    else request.resolve(data.tokenGroups || [])
  }
  worker.onerror = (event) => {
    const error = new Error(event.message || '注音分词 Worker 启动失败')
    workerRequests.forEach(({ reject }) => reject(error))
    workerRequests.clear()
    worker?.terminate()
    worker = null
  }
  return worker
}

function tokenizeOffThread(texts) {
  const id = ++workerRequestId
  return new Promise((resolve, reject) => {
    workerRequests.set(id, { resolve, reject })
    getWorker().postMessage({ id, texts })
  })
}

function isSkippedNode(node, root) {
  let parent = node?.parentNode
  while (parent && parent !== root) {
    if (SKIP.has(parent.nodeName)) return true
    parent = parent.parentNode
  }
  return false
}

function caretAtPoint(x, y, root) {
  let node = null
  let offset = 0
  if (document.caretPositionFromPoint) {
    const pos = document.caretPositionFromPoint(x, y)
    node = pos?.offsetNode || null
    offset = pos?.offset || 0
  } else if (document.caretRangeFromPoint) {
    const range = document.caretRangeFromPoint(x, y)
    node = range?.startContainer || null
    offset = range?.startOffset || 0
  }
  if (!node || node.nodeType !== Node.TEXT_NODE || !root.contains(node) || isSkippedNode(node, root)) return null
  return { node, offset: Math.max(0, Math.min(offset, node.nodeValue?.length || 0)) }
}

function comparePositions(a, b) {
  if (a.node === b.node) return a.offset - b.offset
  const relation = a.node.compareDocumentPosition(b.node)
  return relation & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1
}

// CSS 多列分页不会生成独立的“页”DOM。这里在当前视口内做固定数量的
// caret 命中测试，直接得到本页首尾文本位置；不会再从头扫描整章。
function collectPageEntries(root, viewport) {
  const rect = viewport.getBoundingClientRect()
  const insetX = Math.min(24, rect.width * 0.06)
  const insetY = Math.min(20, rect.height * 0.04)
  const left = rect.left + insetX
  const right = rect.right - insetX
  const top = rect.top + insetY
  const bottom = rect.bottom - insetY
  const xs = [0.05, 0.25, 0.5, 0.75, 0.95].map((ratio) => left + (right - left) * ratio)
  const rowCount = Math.max(8, Math.min(36, Math.ceil((bottom - top) / 24)))
  const positions = []
  for (let row = 0; row <= rowCount; row++) {
    const y = top + (bottom - top) * (row / rowCount)
    for (const x of xs) {
      const position = caretAtPoint(x, y, root)
      if (position) positions.push(position)
    }
  }
  if (!positions.length) return []
  positions.sort(comparePositions)
  const first = positions[0]
  const last = positions[positions.length - 1]

  const offsets = new Map()
  for (const position of positions) {
    const current = offsets.get(position.node) || { min: position.offset, max: position.offset }
    current.min = Math.min(current.min, position.offset)
    current.max = Math.max(current.max, position.offset)
    offsets.set(position.node, current)
  }

  const nodes = []
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.nodeValue || !hasKanji(node.nodeValue) || isSkippedNode(node, root)) return NodeFilter.FILTER_REJECT
      return NodeFilter.FILTER_ACCEPT
    }
  })
  let node = first.node
  while (node) {
    if (
      node !== last.node &&
      (last.node.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING)
    ) break
    if (node.nodeValue && hasKanji(node.nodeValue) && !isSkippedNode(node, root)) nodes.push(node)
    if (node === last.node || nodes.length >= 400) break
    walker.currentNode = node
    node = walker.nextNode()
  }

  // 命中点通常落在字形内部，首尾各多取一小段，避免漏掉页面边缘的行。
  // 单个异常超长文本节点也最多处理 3000 字符。
  const MAX_CHARS = 3000
  let remaining = MAX_CHARS
  const entries = []
  for (const textNode of nodes) {
    const text = textNode.nodeValue || ''
    const hit = offsets.get(textNode)
    let start = textNode === first.node ? Math.max(0, (hit?.min || first.offset) - 120) : 0
    let end = textNode === last.node ? Math.min(text.length, (hit?.max || last.offset) + 120) : text.length
    if (end <= start || remaining <= 0) continue
    end = Math.min(end, start + remaining)
    entries.push({ node: textNode, text: text.slice(start, end), start, end })
    remaining -= end - start
  }
  return entries
}

function buildFragment(tokens, originalText, start, end) {
  const frag = document.createDocumentFragment()
  let changed = false
  if (start > 0) frag.appendChild(document.createTextNode(originalText.slice(0, start)))
  for (const t of tokens) {
    const surface = t.surface
    if (!surface) continue
    const reading = kataToHira(t.reading || '')
    const parts = hasKanji(surface) ? rubyParts(surface, reading) : null
    if (parts) {
      changed = true
      if (parts.pre) frag.appendChild(document.createTextNode(parts.pre))
      const ruby = document.createElement('ruby')
      ruby.className = 'auto-ruby'
      ruby.appendChild(document.createTextNode(parts.core))
      const rt = document.createElement('rt')
      rt.textContent = parts.coreReading
      ruby.appendChild(rt)
      frag.appendChild(ruby)
      if (parts.post) frag.appendChild(document.createTextNode(parts.post))
    } else {
      frag.appendChild(document.createTextNode(surface))
    }
  }
  if (end < originalText.length) frag.appendChild(document.createTextNode(originalText.slice(end)))
  return changed ? frag : null
}

export async function addFurigana(root, viewport) {
  if (!root || !viewport) return
  const version = nextTaskVersion(root)
  const entries = collectPageEntries(root, viewport)
  if (!entries.length || !isCurrentTask(root, version)) return
  const tokenGroups = await tokenizeOffThread(entries.map((entry) => entry.text))
  if (!isCurrentTask(root, version)) return

  // 主线程只负责本页少量 DOM 替换，并继续分帧执行。
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]
    const frag = buildFragment(tokenGroups[i] || [], entry.node.nodeValue || '', entry.start, entry.end)
    if (frag && entry.node.parentNode) entry.node.parentNode.replaceChild(frag, entry.node)
    if ((i + 1) % 8 === 0) {
      await nextFrame()
      if (!isCurrentTask(root, version)) return
    }
  }
}

export async function removeFurigana(root) {
  if (!root) return
  nextTaskVersion(root) // 取消仍在进行的分页注音任务
  const rubies = [...root.querySelectorAll('ruby.auto-ruby')]
  for (let i = 0; i < rubies.length; i++) {
    const r = rubies[i]
    let base = ''
    r.childNodes.forEach((c) => { if (c.nodeName !== 'RT' && c.nodeName !== 'RP') base += c.textContent })
    r.replaceWith(document.createTextNode(base))
    if ((i + 1) % 80 === 0) await nextFrame()
  }
}
