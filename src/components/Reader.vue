<script setup>
import { ref, reactive, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { settings } from '../store.js'
import { analyzeSentence } from '../lib/ai.js'
import {
  caretFromPoint, closestBlock, flattenBlock,
  localToGlobal, buildRange, sentenceAt
} from '../lib/sentence.js'
import AnalysisPanel from './AnalysisPanel.vue'

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
// 宽屏默认展开解析面板；窄屏（手机/折叠屏）默认收起，点句子时再弹出
const wide = typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches
const showPanel = ref(wide)
const loadingChapter = ref(false)

function closeOverlays() {
  showToc.value = false
  // 仅在窄屏（面板为浮层/底部弹层）时由遮罩关闭；宽屏面板是内联列，不受影响
  if (!window.matchMedia('(min-width: 1024px)').matches) showPanel.value = false
}

const ana = reactive({ loading: false, error: '', result: null, sentence: '' })
let reqId = 0

const contentStyle = computed(() => ({
  fontSize: settings.value.fontSize + 'px',
  lineHeight: settings.value.lineHeight,
  maxWidth: settings.value.vertical ? 'none' : settings.value.maxWidth + 'px'
}))

// ---------- 章节加载 ----------
async function loadChapter(index, restoreScroll = false) {
  if (index < 0 || index >= props.book.spine.length) return
  loadingChapter.value = true
  clearHighlight()
  try {
    const { html, title } = await props.book.getChapter(index)
    chapterHtml.value = html
    chapterTitle.value = title
    currentIndex.value = index
    await nextTick()
    if (restoreScroll && props.meta) {
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
      lastScrollLeft: scrollEl.value?.scrollLeft || 0
    })
  }, 400)
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

  // 1) 手动拖选：直接解析选中文字
  const sel = window.getSelection()
  if (sel && !sel.isCollapsed) {
    const t = sel.toString().trim()
    if (t) {
      clearHighlight()
      analyze(t)
      return
    }
  }

  // 2) 单击：定位整句
  const caret = caretFromPoint(e.clientX, e.clientY)
  if (!caret) return
  const block = closestBlock(caret.node, root)
  if (!block) return
  const { text, map } = flattenBlock(block)
  if (!text.trim()) return
  const gi = localToGlobal(map, caret.node, caret.offset)
  if (gi == null) return
  const range = sentenceAt(text, gi)
  if (!range) return
  const domRange = buildRange(map, range[0], range[1])
  const sentence = text.slice(range[0], range[1]).trim()
  if (!sentence) return
  setHighlight(domRange)
  showPanel.value = true
  analyze(sentence)
}

async function analyze(sentence) {
  const myId = ++reqId
  ana.loading = true
  ana.error = ''
  ana.result = null
  ana.sentence = sentence
  showPanel.value = true
  try {
    const result = await analyzeSentence(sentence)
    if (myId !== reqId) return
    ana.result = result
  } catch (err) {
    if (myId !== reqId) return
    ana.error = err.message || String(err)
  } finally {
    if (myId === reqId) ana.loading = false
  }
}
function retry() { if (ana.sentence) analyze(ana.sentence) }

// ---------- 字体 / 排版 ----------
function bumpFont(d) {
  settings.value.fontSize = Math.max(12, Math.min(40, settings.value.fontSize + d))
}
function cycleTheme() {
  const order = ['light', 'sepia', 'dark']
  const i = order.indexOf(settings.value.theme)
  settings.value.theme = order[(i + 1) % order.length]
}

// 键盘翻页
function onKey(e) {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return
  if (e.key === 'ArrowRight' || e.key === 'PageDown') nextChapter()
  if (e.key === 'ArrowLeft' || e.key === 'PageUp') prevChapter()
}

onMounted(() => {
  loadChapter(currentIndex.value, true)
  window.addEventListener('keydown', onKey)
})
onBeforeUnmount(() => {
  clearTimeout(saveTimer)
  window.removeEventListener('keydown', onKey)
})

watch(() => settings.value.vertical, () => nextTick(saveProgress))
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
      <div class="reader-toolbar">
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
        <button class="ghost" title="解析面板" @click="showPanel = !showPanel">🔍</button>
      </div>

      <div
        ref="scrollEl"
        class="reader-scroll scrollbar-thin"
        :class="{ vertical: settings.vertical }"
        @scroll="saveProgress"
      >
        <article
          ref="contentEl"
          class="reader-content"
          :style="contentStyle"
          v-html="chapterHtml"
          @mouseup="onMouseUp"
        />
        <div class="chapter-nav">
          <button :disabled="currentIndex === 0" @click="prevChapter">← 上一章</button>
          <span>{{ currentIndex + 1 }} / {{ book.spine.length }}</span>
          <button :disabled="currentIndex === book.spine.length - 1" @click="nextChapter">下一章 →</button>
        </div>
      </div>
    </section>

    <!-- 浮层遮罩：仅窄屏（抽屉/底部弹层）时可见，点击关闭 -->
    <div v-if="showToc || showPanel" class="scrim" @click="closeOverlays" />

    <!-- 解析面板：宽屏内联右栏；折叠屏右侧抽屉；手机底部弹层 -->
    <AnalysisPanel
      v-if="showPanel"
      class="right"
      :state="ana"
      @retry="retry"
      @close="showPanel = false"
    />
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

.center { flex: 1; min-width: 0; display: flex; flex-direction: column; }
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
  .reader-toolbar .ch-title { display: none; }
  .chapter-nav { padding: 18px; gap: 12px; }
}

@keyframes fade { from { opacity: 0; } to { opacity: 1; } }
@keyframes slideInLeft { from { transform: translateX(-100%); } to { transform: translateX(0); } }
@keyframes slideInRight { from { transform: translateX(100%); } to { transform: translateX(0); } }
@keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
</style>
