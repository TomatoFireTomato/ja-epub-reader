import { preloadTokenizer } from './localseg.js'

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

// CSS 多列分页并不会把每页拆成独立 DOM，因此用文本 Range 的实际位置
// 判断它是否落在当前阅读视口中。这里只决定候选节点，不做分词。
function isVisibleTextNode(node, viewportRect) {
  const range = document.createRange()
  range.selectNodeContents(node)
  const rects = range.getClientRects()
  range.detach?.()
  for (const rect of rects) {
    if (
      rect.right > viewportRect.left && rect.left < viewportRect.right &&
      rect.bottom > viewportRect.top && rect.top < viewportRect.bottom
    ) return true
  }
  return false
}

function buildFragment(tokenizer, text) {
  const tokens = tokenizer.tokenize(text)
  const frag = document.createDocumentFragment()
  let changed = false
  for (const t of tokens) {
    const surface = t.surface_form
    if (!surface) continue
    const reading = kataToHira(t.reading && t.reading !== '*' ? t.reading : '')
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
  return changed ? frag : null
}

export async function addFurigana(root, viewport) {
  if (!root || !viewport) return
  const version = nextTaskVersion(root)
  const tk = await preloadTokenizer()
  if (!isCurrentTask(root, version)) return

  // 只收集当前分页视口内含汉字、且不在 ruby/script 内的文本节点。
  // 分批扫描并主动让出主线程，长章节也不会阻塞页面交互。
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(n) {
      if (!n.nodeValue || !hasKanji(n.nodeValue)) return NodeFilter.FILTER_REJECT
      let p = n.parentNode
      while (p && p !== root) {
        if (SKIP.has(p.nodeName)) return NodeFilter.FILTER_REJECT
        p = p.parentNode
      }
      return NodeFilter.FILTER_ACCEPT
    }
  })
  const nodes = []
  const viewportRect = viewport.getBoundingClientRect()
  let nd
  let scanned = 0
  while ((nd = walker.nextNode())) {
    if (isVisibleTextNode(nd, viewportRect)) nodes.push(nd)
    if (++scanned % 80 === 0) {
      await nextFrame()
      if (!isCurrentTask(root, version)) return
    }
  }

  // Kuromoji 分词和 ruby DOM 替换也分批执行。翻页或关闭注音时，旧任务
  // 会因 version 变化而尽快退出。
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i]
    const frag = buildFragment(tk, node.nodeValue)
    if (frag && node.parentNode) node.parentNode.replaceChild(frag, node)
    if ((i + 1) % 20 === 0) {
      await nextFrame()
      if (!isCurrentTask(root, version)) return
    }
  }
}

export function removeFurigana(root) {
  if (!root) return
  nextTaskVersion(root) // 取消仍在进行的分页注音任务
  root.querySelectorAll('ruby.auto-ruby').forEach((r) => {
    let base = ''
    r.childNodes.forEach((c) => { if (c.nodeName !== 'RT' && c.nodeName !== 'RP') base += c.textContent })
    r.replaceWith(document.createTextNode(base))
  })
}
