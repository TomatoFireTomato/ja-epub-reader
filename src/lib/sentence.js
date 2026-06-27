// 断句（中日 / 英文）+ 把点击位置映射成「整句」DOM Range 的工具集合。

const TERMINATORS = new Set(['。', '．', '！', '？', '!', '?', '…', '‥', '\n'])
const CLOSERS = new Set([
  '」', '』', '）', ')', '】', '〉', '》', '”', '’', '〕', '］', ']', '｝', '}', '"', '\''
])

// 判断文本语言：有假名（或仅汉字）→ 'ja'；没有 CJK 但有拉丁字母 → 'en'；否则按 'ja'。
// 面向「中文用户读外文」，纯中文书少见，故汉字也归 ja（提示语对中文也能用）。
export function detectLang(text) {
  if (!text) return 'ja'
  const s = text.slice(0, 600)
  let cjk = 0, latin = 0
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    if ((c >= 0x3040 && c <= 0x30ff) || (c >= 0x3400 && c <= 0x9fff) || (c >= 0xf900 && c <= 0xfaff) || (c >= 0xff66 && c <= 0xff9d)) cjk++
    else if ((c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a)) latin++
  }
  if (cjk > 0) return 'ja'
  return latin > 0 ? 'en' : 'ja'
}

// 把一段文字按中日句末标点切分，返回 [start, end) 区间数组（含句末标点与紧随的引号）
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

// 句号易与缩写/小数混淆，故英文断句对「.」做额外判断
const EN_ABBR = new Set([
  'mr', 'mrs', 'ms', 'dr', 'prof', 'sr', 'jr', 'st', 'vs', 'etc', 'inc', 'ltd', 'co',
  'no', 'vol', 'fig', 'eg', 'ie', 'am', 'pm', 'us', 'uk', 'mt', 'gen', 'rev', 'hon',
  'capt', 'sgt', 'col', 'lt', 'maj', 'messrs', 'st', 'ave', 'rd'
])

// 英文断句：在 . ! ? 处切，但句号要避开缩写（Mr.）、单字母（A.）与小数（3.14）
export function splitSentencesEn(text) {
  const result = []
  let start = 0
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (ch === '\n') { result.push([start, i + 1]); start = i + 1; continue }
    if (ch !== '.' && ch !== '!' && ch !== '?') continue
    if (ch === '.') {
      const prev = text[i - 1] || '', next = text[i + 1] || ''
      if (/\d/.test(prev) && /\d/.test(next)) continue // 小数
      const m = text.slice(start, i).match(/([A-Za-z]+)$/)
      if (m && (m[1].length === 1 || EN_ABBR.has(m[1].toLowerCase()))) continue // 单字母 / 缩写
    }
    let j = i + 1
    while (j < text.length && (text[j] === '.' || text[j] === '!' || text[j] === '?' || CLOSERS.has(text[j]))) j++
    // 句号后若紧跟小写（多半不是真正句末），不切；! ? 则照切
    if (ch === '.') {
      const mm = text.slice(j).match(/^\s*(\S)/)
      if (mm && !/[A-Z0-9“"'(\[]/.test(mm[1])) continue
    }
    result.push([start, j])
    start = j
    i = j - 1
  }
  if (start < text.length) result.push([start, text.length])
  return result
}

// 返回包含 index 的句子区间（已去除首尾空白）。按语言选择断句方式。
export function sentenceAt(text, index) {
  const parts = detectLang(text) === 'en' ? splitSentencesEn(text) : splitSentences(text)
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

// 判断点击坐标是否真的落在某个字符的字形上（用于过滤空白处点击）
export function pointOnText(node, offset, x, y) {
  if (!node || node.nodeType !== 3) return false
  const len = node.nodeValue.length
  const spans = []
  if (offset < len) spans.push([offset, offset + 1])
  if (offset > 0) spans.push([offset - 1, offset])
  for (const [s, e] of spans) {
    const r = document.createRange()
    try { r.setStart(node, s); r.setEnd(node, e) } catch { continue }
    for (const rect of r.getClientRects()) {
      if (rect.width === 0 && rect.height === 0) continue
      // 横向严格（页边/行尾留白不算），纵向放宽到覆盖行距留白
      const padY = Math.max(2, rect.height * 0.6)
      if (x >= rect.left - 1 && x <= rect.right + 1 && y >= rect.top - padY && y <= rect.bottom + padY) return true
    }
  }
  return false
}
