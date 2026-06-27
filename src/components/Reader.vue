<script setup>
import { ref, reactive, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { settings, ui } from '../store.js'
import { segmentSentence, explainWord, explainGrammar, translateSentence } from '../lib/ai.js'
import {
  caretFromPoint, closestBlock, flattenBlock,
  localToGlobal, buildRange, sentenceAt, pointOnText
} from '../lib/sentence.js'
import AnalysisPanel from './AnalysisPanel.vue'
import SegmentBubble from './SegmentBubble.vue'

const props = defineProps({
  book: { type: Object, required: true },
  meta: { type: Object, default: null }
})
const emit = defineEmits(['progress'])

const scrollEl = ref(null)
const contentEl = ref(null)
const chapterHtml = ref('')
const currentIndex = ref(props.meta?.lastIndex || 0)
const chapterTitle = ref('')
const showToc = ref(false)
// 抽屉（详情）默认收起：点击句子先出气泡，选了具体词/语法才滑开抽屉
const showPanel = ref(false)
const loadingChapter = ref(false)

// 点击位置的分词气泡
const bubble = reactive({ show: false, x: 0, y: 0 })
function hideBubble() { bubble.show = false }
function openBubble(e) { bubble.x = e.clientX; bubble.y = e.clientY; bubble.show = true }
function isNarrow() { return window.matchMedia('(max-width: 600px)').matches }
// 点击是否落在阅读区中央（用于「点中央切换顶栏」的手势，避开左右翻页边缘与上下边）
function isInCenterZone(x, y) {
  const vp = scrollEl.value
  if (!vp) return false
  const r = vp.getBoundingClientRect()
  const cx = (x - r.left) / r.width
  const cy = (y - r.top) / r.height
  return cx > 0.25 && cx < 0.75 && cy > 0.2 && cy < 0.8
}

function closeOverlays() {
  showToc.value = false
  // 仅在窄屏（面板为浮层/底部弹层）时由遮罩关闭；宽屏面板是内联列，不受影响
  if (!window.matchMedia('(min-width: 1024px)').matches) showPanel.value = false
}

// 两步式解析状态：先分词，再按需取每项详情
const sel = reactive({
  sentence: '',
  loading: false, // 分词中
  error: '',
  words: [], // [{surface,reading,pos,detail,loading,error}]
  grammar: [], // [{point,detail,loading,error}]
  active: { type: '', index: -1 }, // 当前展开的详情项
  translation: null,
  translationLoading: false,
  translationError: ''
})
let segId = 0

// ---------- 分页模式 ----------
const PAGE_SIDE = 30 // 页面左右边距
const PAGE_VPAD = 32 // 页面上下边距
const pageIndex = ref(0)
const pageCount = ref(1)
const pageW = ref(0) // 每页步进宽度（=视口宽）
const pageH = ref(0)
function pageEnabled() { return settings.value.pageMode && !settings.value.vertical }

const contentStyle = computed(() => {
  const base = {
    fontSize: settings.value.fontSize + 'px',
    lineHeight: settings.value.lineHeight
  }
  if (pageEnabled() && pageW.value) {
    const w = pageW.value
    return {
      ...base,
      boxSizing: 'border-box',
      width: w + 'px',
      height: pageH.value + 'px',
      padding: PAGE_VPAD + 'px ' + PAGE_SIDE + 'px',
      margin: '0',
      maxWidth: 'none',
      columnWidth: Math.max(100, w - 2 * PAGE_SIDE) + 'px',
      columnGap: 2 * PAGE_SIDE + 'px',
      columnFill: 'auto',
      transform: `translateX(${-pageIndex.value * w}px)`,
      transition: 'transform 0.28s ease'
    }
  }
  return { ...base, maxWidth: settings.value.vertical ? 'none' : settings.value.maxWidth + 'px' }
})

async function computePages() {
  if (!pageEnabled()) { pageCount.value = 1; return }
  const vp = scrollEl.value
  const content = contentEl.value
  if (!vp || !content) return
  pageW.value = vp.clientWidth
  pageH.value = vp.clientHeight
  await nextTick()
  const sw = content.scrollWidth
  pageCount.value = Math.max(1, Math.round(sw / pageW.value))
  pageIndex.value = Math.max(0, Math.min(pageIndex.value, pageCount.value - 1))
}

function goPage(i) {
  pageIndex.value = Math.max(0, Math.min(i, pageCount.value - 1))
  saveProgress()
}
function nextPage() {
  hideBubble()
  if (pageIndex.value < pageCount.value - 1) goPage(pageIndex.value + 1)
  else if (currentIndex.value < props.book.spine.length - 1) loadChapter(currentIndex.value + 1, false, 'start')
}
function prevPage() {
  hideBubble()
  if (pageIndex.value > 0) goPage(pageIndex.value - 1)
  else if (currentIndex.value > 0) loadChapter(currentIndex.value - 1, false, 'last')
}
function togglePageMode() {
  settings.value.pageMode = !settings.value.pageMode
  clearSelection()
  nextTick(() => { pageIndex.value = 0; computePages() })
}

// ---------- 章节加载 ----------
async function loadChapter(index, restore = false, landing = 'start') {
  if (index < 0 || index >= props.book.spine.length) return
  loadingChapter.value = true
  clearSelection()
  try {
    const { html, title } = await props.book.getChapter(index)
    chapterHtml.value = html
    chapterTitle.value = title
    currentIndex.value = index
    await nextTick()
    if (pageEnabled()) {
      pageIndex.value = 0
      await computePages()
      if (landing === 'last') pageIndex.value = pageCount.value - 1
      else if (restore && props.meta) pageIndex.value = Math.min(props.meta.lastPage || 0, pageCount.value - 1)
    } else if (restore && props.meta) {
      scrollEl.value.scrollTop = props.meta.lastScroll || 0
      scrollEl.value.scrollLeft = props.meta.lastScrollLeft || 0
    } else {
      scrollEl.value.scrollTop = 0
      scrollEl.value.scrollLeft = settings.value.vertical ? scrollEl.value.scrollWidth : 0
    }
    saveProgress()
  } finally {
    loadingChapter.value = false
  }
}

function gotoChapter(index) {
  showToc.value = false
  loadChapter(index, false)
}
function prevChapter() { if (currentIndex.value > 0) loadChapter(currentIndex.value - 1, false) }
function nextChapter() {
  if (currentIndex.value < props.book.spine.length - 1) loadChapter(currentIndex.value + 1, false)
}

// ---------- 进度保存（防抖） ----------
let saveTimer = null
function saveProgress() {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    emit('progress', {
      lastIndex: currentIndex.value,
      lastScroll: scrollEl.value?.scrollTop || 0,
      lastScrollLeft: scrollEl.value?.scrollLeft || 0,
      lastPage: pageIndex.value
    })
  }, 400)
}
// 滚动时隐藏气泡（避免气泡停在错误位置），并保存进度
function onScroll() {
  if (bubble.show) hideBubble()
  saveProgress()
}

// ---------- 点击选句 ----------
let highlightObj = null
function setHighlight(range) {
  if (!range) return
  if (typeof Highlight !== 'undefined' && window.CSS && CSS.highlights) {
    highlightObj = new Highlight(range)
    CSS.highlights.set('ja-sentence', highlightObj)
  } else {
    const sel = window.getSelection()
    sel.removeAllRanges()
    sel.addRange(range)
  }
}
function clearHighlight() {
  if (window.CSS && CSS.highlights) CSS.highlights.delete('ja-sentence')
  highlightObj = null
}

function onMouseUp(e) {
  const root = contentEl.value
  if (!root) return
  if (swiped) { swiped = false; return } // 刚刚是翻页滑动，不当作点击选句

  // 1) 手动拖选：直接对选中文字分词
  const winSel = window.getSelection()
  if (winSel && !winSel.isCollapsed) {
    const t = winSel.toString().trim()
    if (t) { clearHighlight(); openBubble(e); selectSentence(t); return }
  }

  // 2) 单击：必须点在文字字形上，否则视为空白点击
  const caret = caretFromPoint(e.clientX, e.clientY)
  if (!caret || caret.node.nodeType !== 3 || !pointOnText(caret.node, caret.offset, e.clientX, e.clientY)) {
    // 已有选中/气泡：先消掉；否则点在中央空白处则切换顶栏（呼出/隐藏）
    if (sel.sentence || bubble.show) { clearSelection(); return }
    if (isInCenterZone(e.clientX, e.clientY)) { ui.immersive = !ui.immersive; return }
    clearSelection()
    return
  }
  const block = closestBlock(caret.node, root)
  const { text, map } = flattenBlock(block)
  if (!text.trim()) { clearSelection(); return }
  const gi = localToGlobal(map, caret.node, caret.offset)
  if (gi == null) { clearSelection(); return }
  const range = sentenceAt(text, gi)
  if (!range) { clearSelection(); return }
  const domRange = buildRange(map, range[0], range[1])
  const sentence = text.slice(range[0], range[1]).trim()
  if (!sentence) { clearSelection(); return }
  setHighlight(domRange)
  openBubble(e)
  selectSentence(sentence)
}

const EMPTY_SEL = () => ({
  sentence: '', loading: false, error: '', words: [], grammar: [],
  active: { type: '', index: -1 }, translation: null, translationLoading: false, translationError: ''
})

// 点击空白：去掉高亮、气泡与上次的选中结果（抽屉随之显示空提示）
function clearSelection() {
  clearHighlight()
  hideBubble()
  segId++ // 取消可能在途的分词
  Object.assign(sel, EMPTY_SEL())
}

// 第一步：分词 + 语法点识别（小请求，省 token）。只填气泡，不开抽屉
async function selectSentence(sentence) {
  const id = ++segId
  Object.assign(sel, EMPTY_SEL(), { sentence, loading: true })
  try {
    const r = await segmentSentence(sentence)
    if (id !== segId) return
    sel.words = (r.words || []).map((w) => ({
      surface: w.surface || '', reading: w.reading || '', pos: w.pos || '',
      detail: null, loading: false, error: ''
    }))
    sel.grammar = (r.grammar || []).map((g) => ({ point: g.point || '', detail: null, loading: false, error: '' }))
  } catch (err) {
    if (id !== segId) return
    sel.error = err.message || String(err)
  } finally {
    if (id === segId) sel.loading = false
  }
}

// 第二步：在气泡里点单词 / 语法点 / 翻译 → 滑开抽屉展示详情（带缓存）
function openDrawer() {
  showPanel.value = true
  if (isNarrow()) hideBubble() // 手机上底部弹层会盖住气泡，开抽屉时收起气泡
}
async function pickWord(i) {
  const w = sel.words[i]
  if (!w) return
  sel.active = { type: 'word', index: i }
  openDrawer()
  if (w.detail || w.loading) return
  w.loading = true; w.error = ''
  try { w.detail = await explainWord(sel.sentence, w.surface) }
  catch (err) { w.error = err.message || String(err) }
  finally { w.loading = false }
}
async function pickGrammar(i) {
  const g = sel.grammar[i]
  if (!g) return
  sel.active = { type: 'grammar', index: i }
  openDrawer()
  if (g.detail || g.loading) return
  g.loading = true; g.error = ''
  try { g.detail = await explainGrammar(sel.sentence, g.point) }
  catch (err) { g.error = err.message || String(err) }
  finally { g.loading = false }
}
async function loadTranslation() {
  sel.active = { type: 'translation', index: -1 }
  openDrawer()
  if (sel.translation || sel.translationLoading) return
  sel.translationLoading = true; sel.translationError = ''
  try { sel.translation = await translateSentence(sel.sentence) }
  catch (err) { sel.translationError = err.message || String(err) }
  finally { sel.translationLoading = false }
}
function retrySeg() { if (sel.sentence) selectSentence(sel.sentence) }

// ---------- 字体 / 排版 ----------
function bumpFont(d) {
  settings.value.fontSize = Math.max(12, Math.min(40, settings.value.fontSize + d))
}
function cycleTheme() {
  const order = ['light', 'sepia', 'dark']
  const i = order.indexOf(settings.value.theme)
  settings.value.theme = order[(i + 1) % order.length]
}

// 键盘翻页 / Esc 关气泡（分页模式翻页，滚动模式翻章）
function onKey(e) {
  if (e.key === 'Escape') { hideBubble(); return }
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return
  const fwd = e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' '
  const back = e.key === 'ArrowLeft' || e.key === 'PageUp'
  if (!fwd && !back) return
  if (pageEnabled()) { fwd ? nextPage() : prevPage() }
  else { fwd ? nextChapter() : prevChapter() }
}

// 触摸滑动翻页（分页模式）
let touchX = 0, touchY = 0, swiped = false
function onTouchStart(e) {
  if (!pageEnabled() || !e.touches[0]) return
  touchX = e.touches[0].clientX; touchY = e.touches[0].clientY; swiped = false
}
function onTouchEnd(e) {
  if (!pageEnabled() || !e.changedTouches[0]) return
  const dx = e.changedTouches[0].clientX - touchX
  const dy = e.changedTouches[0].clientY - touchY
  if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.4) {
    swiped = true // 标记本次为滑动，避免触发选句
    dx < 0 ? nextPage() : prevPage()
  }
}

let resizeTimer = null
function onResize() {
  clearTimeout(resizeTimer)
  resizeTimer = setTimeout(() => { if (pageEnabled()) computePages() }, 150)
}

// 点击气泡与正文之外的地方 → 关掉气泡
function onDocPointerDown(e) {
  if (!bubble.show) return
  const t = e.target
  if (t.closest && t.closest('.seg-bubble')) return
  if (contentEl.value && contentEl.value.contains(t)) return
  hideBubble()
}

let ro = null
onMounted(() => {
  loadChapter(currentIndex.value, true)
  window.addEventListener('keydown', onKey)
  document.addEventListener('pointerdown', onDocPointerDown)
  window.addEventListener('resize', onResize)
  // 监听阅读容器尺寸变化（视口缩放、旋转、面板开合）→ 重算分页
  if (window.ResizeObserver && scrollEl.value) {
    ro = new ResizeObserver(() => onResize())
    ro.observe(scrollEl.value)
  }
})
onBeforeUnmount(() => {
  clearTimeout(saveTimer)
  clearTimeout(resizeTimer)
  window.removeEventListener('keydown', onKey)
  document.removeEventListener('pointerdown', onDocPointerDown)
  window.removeEventListener('resize', onResize)
  if (ro) ro.disconnect()
})

watch(() => settings.value.vertical, () => nextTick(saveProgress))
// 字号 / 行距 / 分页 / 竖排 改变 → 重新计算分页
watch(
  () => [settings.value.fontSize, settings.value.lineHeight, settings.value.pageMode, settings.value.vertical],
  () => { if (pageEnabled()) nextTick(computePages) }
)

// 首次进入沉浸模式时，短暂提示「点中央可呼出栏」
const immersiveHint = ref(false)
let hintShown = false
let hintTimer = null
watch(() => ui.immersive, (v) => {
  if (v && !hintShown) {
    hintShown = true
    immersiveHint.value = true
    clearTimeout(hintTimer)
    hintTimer = setTimeout(() => { immersiveHint.value = false }, 2600)
  }
})
</script>

<template>
  <div class="reader" :class="{ 'panel-open': showPanel }">
    <!-- 目录 -->
    <aside v-show="showToc" class="toc scrollbar-thin">
      <div class="toc-head">目录</div>
      <button
        v-for="item in book.toc"
        :key="item.index + item.label"
        class="toc-item ghost"
        :class="{ active: item.index === currentIndex }"
        @click="gotoChapter(item.index)"
      >{{ item.label }}</button>
    </aside>

    <!-- 阅读区 -->
    <section class="center">
      <div v-show="!ui.immersive" class="reader-toolbar">
        <button class="ghost" title="目录" @click="showToc = !showToc">☰</button>
        <button class="ghost" title="上一章" :disabled="currentIndex === 0" @click="prevChapter">‹</button>
        <button class="ghost" title="下一章" :disabled="currentIndex === book.spine.length - 1" @click="nextChapter">›</button>
        <span class="ch-title">{{ chapterTitle || `第 ${currentIndex + 1} 节` }}</span>
        <span class="spacer" />
        <button class="ghost" title="减小字号" @click="bumpFont(-1)">A−</button>
        <button class="ghost" title="增大字号" @click="bumpFont(1)">A+</button>
        <button class="ghost" title="主题" @click="cycleTheme">◐</button>
        <button class="ghost" title="竖排 / 横排" @click="settings.vertical = !settings.vertical">
          {{ settings.vertical ? '横排' : '竖排' }}
        </button>
        <button class="ghost" :title="settings.pageMode ? '切换到滚动模式' : '切换到分页模式'" @click="togglePageMode">
          {{ settings.pageMode ? '滚动' : '分页' }}
        </button>
        <button class="ghost" title="解析面板" @click="showPanel = !showPanel">🔍</button>
        <button class="ghost" title="沉浸阅读（收起顶栏）" @click="ui.immersive = true">⤢</button>
      </div>

      <div
        ref="scrollEl"
        class="reader-scroll scrollbar-thin"
        :class="{ vertical: settings.vertical, paged: pageEnabled() }"
        @scroll="onScroll"
        @touchstart.passive="onTouchStart"
        @touchend.passive="onTouchEnd"
      >
        <article
          ref="contentEl"
          class="reader-content"
          :style="contentStyle"
          v-html="chapterHtml"
          @mouseup="onMouseUp"
        />
        <div v-if="!pageEnabled()" class="chapter-nav">
          <button :disabled="currentIndex === 0" @click="prevChapter">← 上一章</button>
          <span>{{ currentIndex + 1 }} / {{ book.spine.length }}</span>
          <button :disabled="currentIndex === book.spine.length - 1" @click="nextChapter">下一章 →</button>
        </div>
      </div>

      <!-- 分页模式：左右翻页按钮 + 页码（用 prev/next 避免与解析抽屉的 .right 撞名） -->
      <template v-if="pageEnabled()">
        <button class="page-edge prev" title="上一页" @click="prevPage">‹</button>
        <button class="page-edge next" title="下一页" @click="nextPage">›</button>
        <div class="page-indicator">{{ pageIndex + 1 }} / {{ pageCount }}</div>
      </template>
    </section>

    <!-- 进入沉浸模式的一次性提示 -->
    <transition name="toast">
      <div v-if="immersiveHint" class="immersive-hint">点击屏幕中央，可呼出 / 隐藏顶栏</div>
    </transition>

    <!-- 浮层遮罩：仅窄屏（抽屉/底部弹层）时可见，点击关闭 -->
    <div v-if="showToc || showPanel" class="scrim" @click="closeOverlays" />

    <!-- 详情抽屉：宽屏内联右栏；折叠屏右侧抽屉；手机底部弹层。仅展示选中项详情 -->
    <AnalysisPanel
      v-if="showPanel"
      class="right"
      :sel="sel"
      @retry="retrySeg"
      @close="showPanel = false"
    />

    <!-- 点击位置的分词气泡（挂到 body，避免被容器裁剪） -->
    <Teleport to="body">
      <SegmentBubble
        v-if="bubble.show"
        :sel="sel"
        :x="bubble.x"
        :y="bubble.y"
        @word="pickWord"
        @grammar="pickGrammar"
        @translate="loadTranslation"
        @close="hideBubble"
      />
    </Teleport>
  </div>
</template>

<style scoped>
.reader { height: 100%; display: flex; min-height: 0; }

.toc {
  flex: 0 0 240px; width: 240px; overflow: auto;
  background: var(--panel); border-right: 1px solid var(--border);
  padding: 10px; display: flex; flex-direction: column; gap: 2px;
}
.toc-head { font-weight: 700; padding: 6px 8px; color: var(--text-dim); }
.toc-item { text-align: left; padding: 8px 10px; border-radius: 6px; white-space: normal; line-height: 1.4; }
.toc-item:hover { background: var(--accent-soft); }
.toc-item.active { background: var(--accent-soft); color: var(--accent); font-weight: 600; }

.center { flex: 1; min-width: 0; display: flex; flex-direction: column; position: relative; }
.reader-toolbar {
  display: flex; align-items: center; gap: 6px;
  padding: 8px 12px; border-bottom: 1px solid var(--border); background: var(--panel);
}
.reader-toolbar .ch-title { color: var(--text-dim); font-size: 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 30vw; }
.reader-toolbar .spacer { flex: 1; }

.reader-scroll { flex: 1; overflow: auto; background: var(--reader-bg); }
.reader-content {
  color: var(--reader-text);
  margin: 0 auto; padding: 40px 28px 24px;
  font-family: 'Hiragino Mincho ProN', 'Yu Mincho', 'Noto Serif CJK JP', serif;
}
/* 竖排 */
.reader-scroll.vertical { overflow-x: auto; overflow-y: hidden; }
.reader-scroll.vertical .reader-content {
  writing-mode: vertical-rl; -webkit-writing-mode: vertical-rl;
  height: 100%; padding: 28px 40px; margin: 0;
}

/* 分页模式：视口裁剪，内容用多列排版并整体平移翻页（列样式见 contentStyle 内联） */
.reader-scroll.paged { overflow: hidden; }
.reader-scroll.paged .reader-content { will-change: transform; }

/* 翻页按钮（左右边缘）与页码 */
.page-edge {
  position: absolute; top: 50%; transform: translateY(-50%);
  width: 44px; height: 88px; display: flex; align-items: center; justify-content: center;
  border: none; border-radius: 12px; background: var(--panel); color: var(--text-dim);
  opacity: 0.32; font-size: 24px; box-shadow: 0 2px 10px rgba(0,0,0,0.12); z-index: 5;
}
.page-edge:hover { opacity: 0.9; border-color: var(--accent); }
.page-edge.prev { left: 6px; }
.page-edge.next { right: 6px; }
.page-indicator {
  position: absolute; bottom: 8px; left: 50%; transform: translateX(-50%);
  color: var(--text-dim); font-size: 12px; background: var(--reader-bg);
  padding: 2px 10px; border-radius: 999px; z-index: 5; pointer-events: none;
}

/* EPUB 内容的基本排版 */
.reader-content :deep(p) { margin: 0 0 1em; text-indent: 1em; }
.reader-content :deep(img) { max-width: 100%; height: auto; }
.reader-content :deep(rt) { font-size: 0.55em; color: var(--text-dim); }
.reader-content :deep(h1),
.reader-content :deep(h2),
.reader-content :deep(h3) { line-height: 1.4; }
.reader-content :deep(a) { color: inherit; text-decoration: none; }
.reader-content :deep(*) { cursor: text; }

.chapter-nav {
  display: flex; align-items: center; justify-content: center; gap: 18px;
  padding: 24px; color: var(--text-dim);
}

.right { flex: 0 0 380px; width: 380px; }

/* 遮罩默认（宽屏）隐藏 */
.scrim { display: none; }

/* ---------- 折叠屏 / 小平板：抽屉式（≤1023px） ---------- */
@media (max-width: 1023px) {
  .scrim {
    display: block; position: fixed; inset: 0;
    background: rgba(0, 0, 0, 0.42); z-index: 30; animation: fade 0.2s ease;
  }
  .toc {
    position: fixed; left: 0; top: 0; bottom: 0;
    width: min(280px, 80vw); z-index: 40;
    padding-top: max(10px, env(safe-area-inset-top));
    padding-left: max(10px, env(safe-area-inset-left));
    box-shadow: 8px 0 28px rgba(0, 0, 0, 0.22);
    animation: slideInLeft 0.22s ease;
  }
  .reader .right {
    position: fixed; right: 0; top: 0; bottom: 0;
    width: min(420px, 88vw); height: auto; z-index: 40;
    box-shadow: -8px 0 28px rgba(0, 0, 0, 0.22);
    animation: slideInRight 0.22s ease;
  }
  .reader-toolbar { gap: 4px; padding: 8px 10px; }
  .reader-toolbar button { padding: 6px 9px; flex: 0 0 auto; }
}

/* ---------- 手机 / 折叠屏外屏：底部弹层（≤600px） ---------- */
@media (max-width: 600px) {
  .reader .right {
    left: 0; right: 0; bottom: 0; top: auto;
    width: auto; height: min(74vh, 620px);
    border-radius: 16px 16px 0 0; border-left: none;
    box-shadow: 0 -10px 30px rgba(0, 0, 0, 0.26);
    padding-bottom: env(safe-area-inset-bottom);
    animation: slideUp 0.24s ease;
  }
  .reader-content { padding: 24px 16px 20px; }
  .reader-scroll.vertical .reader-content { padding: 20px 24px; }
  /* 工具栏按钮较多：隐藏标题、紧凑排布，必要时可横向滑动，避免换行破版 */
  .reader-toolbar { gap: 2px; padding: 6px 6px; flex-wrap: nowrap; overflow-x: auto; }
  .reader-toolbar::-webkit-scrollbar { display: none; }
  .reader-toolbar .ch-title { display: none; }
  .reader-toolbar .spacer { display: none; }
  .reader-toolbar button { padding: 6px 8px; }
  .chapter-nav { padding: 18px; gap: 12px; }
  .page-edge { width: 36px; height: 72px; font-size: 20px; }
}

/* 沉浸提示 toast */
.immersive-hint {
  position: fixed; z-index: 47; left: 50%; top: 50%; transform: translate(-50%, -50%);
  background: rgba(0, 0, 0, 0.74); color: #fff; font-size: 13px;
  padding: 10px 16px; border-radius: 999px; pointer-events: none;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.25);
}
.toast-enter-active, .toast-leave-active { transition: opacity 0.4s ease; }
.toast-enter-from, .toast-leave-to { opacity: 0; }

@keyframes fade { from { opacity: 0; } to { opacity: 1; } }
@keyframes slideInLeft { from { transform: translateX(-100%); } to { transform: translateX(0); } }
@keyframes slideInRight { from { transform: translateX(100%); } to { transform: translateX(0); } }
@keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
</style>
