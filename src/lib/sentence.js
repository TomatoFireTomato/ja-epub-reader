// 日语断句 + 把点击位置映射成「整句」DOM Range 的工具集合。

const TERMINATORS = new Set(['。', '．', '！', '？', '!', '?', '…', '‥', '\n'])
const CLOSERS = new Set([
  '」', '』', '）', ')', '】', '〉', '》', '”', '’', '〕', '］', ']', '｝', '}', '"', '\''
])

// 把一段文字按日语句末标点切分，返回 [start, end) 区间数组（含句末标点与紧随的引号）
export function splitSentences(text) {
  const result = []
  let start = 0
  for (let i = 0; i < text.length; i++) {
    if (TERMINATORS.has(text[i])) {
      let j = i + 1
      while (j < text.length && (TERMINATORS.has(text[j]) || CLOSERS.has(text[j]))) j++
      result.push([start, j])
      start = j
      i = j - 1
    }
  }
  if (start < text.length) result.push([start, text.length])
  return result
}

// 返回包含 index 的句子区间（已去除首尾空白）
export function sentenceAt(text, index) {
  const parts = splitSentences(text)
  let chosen = null
  for (const [s, e] of parts) {
    if (index >= s && index < e) { chosen = [s, e]; break }
  }
  if (!chosen && parts.length) chosen = parts[parts.length - 1]
  if (!chosen) return null
  let [a, b] = chosen
  while (a < b && /\s/.test(text[a])) a++
  while (b > a && /\s/.test(text[b - 1])) b--
  return a < b ? [a, b] : null
}

// ---------- DOM ↔ 文本偏移 映射 ----------
const BLOCK_TAGS = new Set([
  'P', 'DIV', 'LI', 'BLOCKQUOTE', 'TD', 'TH', 'SECTION', 'ARTICLE',
  'FIGCAPTION', 'DD', 'DT', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6'
])

// 从点击坐标取得 { node(文本节点), offset }
export function caretFromPoint(x, y) {
  if (document.caretPositionFromPoint) {
    const p = document.caretPositionFromPoint(x, y)
    if (p && p.offsetNode && p.offsetNode.nodeType === 3) {
      return { node: p.offsetNode, offset: p.offset }
    }
    if (p && p.offsetNode) return { node: p.offsetNode, offset: p.offset, element: true }
  }
  if (document.caretRangeFromPoint) {
    const r = document.caretRangeFromPoint(x, y)
    if (r && r.startContainer.nodeType === 3) {
      return { node: r.startContainer, offset: r.startOffset }
    }
  }
  return null
}

// 找到包含某节点的块级元素（最多到 root）
export function closestBlock(node, root) {
  let el = node.nodeType === 3 ? node.parentElement : node
  while (el && el !== root) {
    if (BLOCK_TAGS.has(el.nodeName)) return el
    el = el.parentElement
  }
  return root
}

// 把块内文本拍平为字符串，并记录每个文本节点对应的偏移区间；跳过 furigana(rt/rp)
export function flattenBlock(block) {
  const map = []
  let textStr = ''
  const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      let p = node.parentNode
      while (p && p !== block) {
        const t = p.nodeName.toLowerCase()
        if (t === 'rt' || t === 'rp') return NodeFilter.FILTER_REJECT
        p = p.parentNode
      }
      return NodeFilter.FILTER_ACCEPT
    }
  })
  let node
  while ((node = walker.nextNode())) {
    const start = textStr.length
    textStr += node.nodeValue
    map.push({ node, start, end: textStr.length })
  }
  return { text: textStr, map }
}

// 文本节点 + offset → 全局偏移；点到 ruby 注音等被跳过节点时，回退到最近的有效节点
export function localToGlobal(map, node, offset) {
  for (const m of map) {
    if (m.node === node) return m.start + offset
  }
  // 回退：找文档顺序上紧随其后的第一个有效文本节点
  for (const m of map) {
    const pos = node.compareDocumentPosition(m.node)
    if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return m.start
  }
  return map.length ? map[map.length - 1].end : null
}

function locate(map, g) {
  for (const m of map) {
    if (g >= m.start && g <= m.end) return { node: m.node, offset: g - m.start }
  }
  const last = map[map.length - 1]
  return last ? { node: last.node, offset: last.node.nodeValue.length } : null
}

// 由全局偏移区间构造 DOM Range
export function buildRange(map, gStart, gEnd) {
  const a = locate(map, gStart)
  const b = locate(map, gEnd)
  if (!a || !b) return null
  const range = document.createRange()
  range.setStart(a.node, a.offset)
  range.setEnd(b.node, b.offset)
  return range
}
