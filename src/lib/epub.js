import JSZip from 'jszip'

// ---------- 路径工具 ----------
function dirname(p) {
  const i = p.lastIndexOf('/')
  return i >= 0 ? p.slice(0, i) : ''
}

// 把相对路径 rel 解析为 zip 内的规范路径（base 为所在目录）
function resolvePath(base, rel) {
  if (/^https?:/i.test(rel)) return rel
  rel = decodeURIComponent(rel.split('#')[0])
  let stack = base ? base.split('/') : []
  if (rel.startsWith('/')) stack = []
  for (const part of rel.split('/')) {
    if (part === '' || part === '.') continue
    if (part === '..') stack.pop()
    else stack.push(part)
  }
  return stack.join('/')
}

// ---------- XML / zip 读取 ----------
async function readText(zip, path) {
  const file = zip.file(path)
  if (!file) throw new Error('EPUB 中找不到文件：' + path)
  return file.async('string')
}

function parseXml(xml) {
  return new DOMParser().parseFromString(xml, 'application/xml')
}

// 按 localName 取元素，忽略命名空间（兼容 dc:title 等）
function els(root, localName) {
  return Array.from(root.getElementsByTagNameNS('*', localName))
}

function text(node) {
  return node ? (node.textContent || '').trim() : ''
}

// ---------- 主解析入口 ----------
export async function parseEpub(input) {
  const zip = await JSZip.loadAsync(input)

  // 1. container.xml → OPF 路径
  const containerXml = await readText(zip, 'META-INF/container.xml')
  const container = parseXml(containerXml)
  const rootfile = els(container, 'rootfile')[0]
  const opfPath = rootfile && rootfile.getAttribute('full-path')
  if (!opfPath) throw new Error('解析失败：container.xml 中没有 rootfile')

  const opfDir = dirname(opfPath)

  // 2. 解析 OPF
  const opf = parseXml(await readText(zip, opfPath))
  const title = text(els(opf, 'title')[0]) || '未命名'
  const creator = text(els(opf, 'creator')[0]) || ''
  const language = text(els(opf, 'language')[0]) || 'ja'

  // manifest：id → { href, type, properties }
  const manifest = {}
  for (const item of els(opf, 'item')) {
    const id = item.getAttribute('id')
    if (!id) continue
    manifest[id] = {
      href: item.getAttribute('href'),
      type: item.getAttribute('media-type') || '',
      properties: item.getAttribute('properties') || ''
    }
  }

  // spine：有序的 manifest id 列表
  const spine = []
  for (const ref of els(opf, 'itemref')) {
    const idref = ref.getAttribute('idref')
    if (manifest[idref]) spine.push(idref)
  }
  if (spine.length === 0) throw new Error('解析失败：spine 为空')

  // 每个章节文件在 zip 内的路径 → spine 索引（供目录定位）
  // 同时登记文件名(basename)作兜底：有些书目录路径前缀不规范，靠文件名也能匹配上。
  const pathToIndex = {}
  spine.forEach((id, i) => {
    const p = resolvePath(opfDir, manifest[id].href)
    pathToIndex[p] = i
    const base = p.split('/').pop()
    if (base && !(base in pathToIndex)) pathToIndex[base] = i
  })

  const book = {
    title,
    creator,
    language,
    zip,
    opfDir,
    manifest,
    spine,
    _resCache: new Map()
  }

  book.toc = await buildToc(book, opf, pathToIndex)
  book.getChapter = (index) => getChapter(book, index)
  book.revoke = () => {
    for (const url of book._resCache.values()) URL.revokeObjectURL(url)
    book._resCache.clear()
  }
  return book
}

// ---------- 目录（TOC） ----------
async function buildToc(book, opf, pathToIndex) {
  const { manifest, opfDir } = book
  // EPUB3：manifest 中 properties 含 nav 的项
  let navId = null
  for (const id in manifest) {
    if (/\bnav\b/.test(manifest[id].properties)) { navId = id; break }
  }
  if (navId) {
    try { return await tocFromNav(book, resolvePath(opfDir, manifest[navId].href), pathToIndex) }
    catch { /* 回退到 ncx */ }
  }
  // EPUB2：ncx
  const spineEl = els(opf, 'spine')[0]
  let ncxId = spineEl && spineEl.getAttribute('toc')
  if (!ncxId) {
    for (const id in manifest) {
      if (manifest[id].type === 'application/x-dtbncx+xml') { ncxId = id; break }
    }
  }
  if (ncxId && manifest[ncxId]) {
    try { return await tocFromNcx(book, resolvePath(opfDir, manifest[ncxId].href), pathToIndex) }
    catch { /* 回退到 spine */ }
  }
  // 兜底：用 spine 顺序生成目录
  return book.spine.map((id, i) => ({ label: '第 ' + (i + 1) + ' 节', index: i, anchor: '' }))
}

// 取 href 中的锚点（# 后面的部分），用于章节内定位
function hashOf(href) {
  const i = href.indexOf('#')
  return i >= 0 ? href.slice(i + 1) : ''
}

// 先按完整路径匹配 spine，匹配不上再按文件名兜底（容忍目录路径前缀不规范的书）
function lookupIndex(pathToIndex, target) {
  if (target in pathToIndex) return pathToIndex[target]
  const base = target.split('/').pop()
  if (base && base in pathToIndex) return pathToIndex[base]
  return null
}

async function tocFromNav(book, navPath, pathToIndex) {
  const navDir = dirname(navPath)
  const doc = new DOMParser().parseFromString(await readText(book.zip, navPath), 'text/html')
  let nav = Array.from(doc.querySelectorAll('nav')).find(
    (n) => (n.getAttribute('epub:type') || n.getAttribute('type') || '').includes('toc')
  ) || doc.querySelector('nav')
  if (!nav) return []
  const out = []
  for (const a of nav.querySelectorAll('a[href]')) {
    const href = a.getAttribute('href')
    const index = lookupIndex(pathToIndex, resolvePath(navDir, href))
    if (index != null) out.push({ label: (a.textContent || '').trim() || '（无标题）', index, anchor: hashOf(href) })
  }
  return dedupeToc(out)
}

async function tocFromNcx(book, ncxPath, pathToIndex) {
  const ncxDir = dirname(ncxPath)
  const doc = parseXml(await readText(book.zip, ncxPath))
  const out = []
  for (const np of els(doc, 'navPoint')) {
    const label = text(els(np, 'text')[0])
    const content = els(np, 'content')[0]
    const src = content && content.getAttribute('src')
    if (!src) continue
    const index = lookupIndex(pathToIndex, resolvePath(ncxDir, src))
    if (index != null) out.push({ label: label || '（无标题）', index, anchor: hashOf(src) })
  }
  return dedupeToc(out)
}

function dedupeToc(list) {
  const seen = new Set()
  return list.filter((e) => {
    const k = e.index + '|' + e.anchor + '|' + e.label
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

// ---------- 章节内容 ----------
async function resourceUrl(book, path) {
  if (book._resCache.has(path)) return book._resCache.get(path)
  const file = book.zip.file(path)
  if (!file) return ''
  const blob = await file.async('blob')
  const url = URL.createObjectURL(blob)
  book._resCache.set(path, url)
  return url
}

async function getChapter(book, index) {
  const id = book.spine[index]
  const item = book.manifest[id]
  const path = resolvePath(book.opfDir, item.href)
  const dir = dirname(path)
  const doc = new DOMParser().parseFromString(await readText(book.zip, path), 'text/html')
  const body = doc.body || doc.createElement('body')

  // 去掉脚本与样式（使用阅读器自带排版）
  body.querySelectorAll('script, style, link').forEach((n) => n.remove())

  // <img> 资源 → blob URL
  for (const img of Array.from(body.querySelectorAll('img'))) {
    const src = img.getAttribute('src')
    if (src) img.setAttribute('src', await resourceUrl(book, resolvePath(dir, src)))
    img.setAttribute('loading', 'lazy')
  }
  // SVG <image> 资源
  for (const im of Array.from(body.querySelectorAll('image'))) {
    const href = im.getAttribute('xlink:href') || im.getAttribute('href')
    if (href) {
      im.setAttribute('href', await resourceUrl(book, resolvePath(dir, href)))
      im.removeAttribute('xlink:href')
    }
  }

  return { html: body.innerHTML, title: book.toc.find((t) => t.index === index)?.label || '' }
}
