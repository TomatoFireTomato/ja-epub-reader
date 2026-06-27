<script setup>
import { ref, onMounted } from 'vue'
import { listBooks, deleteBook } from '../lib/storage.js'

const props = defineProps({
  loading: Boolean,
  error: String
})
const emit = defineEmits(['open-file', 'open-saved'])

const recent = ref([])
const dragOver = ref(false)
const fileInput = ref(null)

async function refresh() {
  recent.value = await listBooks()
}
onMounted(refresh)

function pick() {
  fileInput.value?.click()
}

function onFile(e) {
  const file = e.target.files?.[0]
  if (file) emit('open-file', file)
  e.target.value = ''
}

function onDrop(e) {
  dragOver.value = false
  const file = e.dataTransfer?.files?.[0]
  if (file && /\.epub$/i.test(file.name)) emit('open-file', file)
}

async function remove(rec) {
  await deleteBook(rec.id)
  await refresh()
}

function fmtDate(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
</script>

<template>
  <div class="library scrollbar-thin">
    <div class="hero">
      <h1>外语小说阅读器</h1>
      <p class="sub">导入本地 EPUB（日文 / 英文），阅读时点击句子，让 AI 拆解语法与单词。</p>

      <div
        class="dropzone"
        :class="{ over: dragOver }"
        @click="pick"
        @dragover.prevent="dragOver = true"
        @dragleave.prevent="dragOver = false"
        @drop.prevent="onDrop"
      >
        <div class="dz-icon">📚</div>
        <div v-if="loading" class="dz-main">正在解析…</div>
        <template v-else>
          <div class="dz-main">点击选择，或把 .epub 文件拖到这里</div>
          <div class="dz-sub">文件只保存在你本地浏览器中</div>
        </template>
      </div>
      <input ref="fileInput" type="file" accept=".epub,application/epub+zip" hidden @change="onFile" />

      <p v-if="error" class="err">{{ error }}</p>
    </div>

    <div v-if="recent.length" class="recent">
      <h2>最近阅读</h2>
      <div class="cards">
        <div v-for="rec in recent" :key="rec.id" class="card" @click="emit('open-saved', rec)">
          <div class="card-cover">{{ (rec.title || '?').slice(0, 1) }}</div>
          <div class="card-body">
            <div class="card-title" :title="rec.title">{{ rec.title }}</div>
            <div class="card-meta">{{ rec.creator || '佚名' }}</div>
            <div class="card-meta">第 {{ (rec.lastIndex || 0) + 1 }} 节 · {{ fmtDate(rec.openedAt) }}</div>
          </div>
          <button class="del ghost" title="删除" @click.stop="remove(rec)">✕</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.library {
  height: 100%; overflow: auto; padding: 40px 24px 60px;
  padding-left: max(24px, env(safe-area-inset-left));
  padding-right: max(24px, env(safe-area-inset-right));
}
@media (max-width: 560px) {
  .library { padding: 24px 16px 48px; }
  .dropzone { padding: 36px 16px; }
  h1 { font-size: 23px; }
}
.hero { max-width: 640px; margin: 0 auto; text-align: center; }
h1 { font-size: 28px; margin: 8px 0; }
.sub { color: var(--text-dim); margin: 0 0 24px; }
.dropzone {
  border: 2px dashed var(--border); border-radius: 16px;
  padding: 48px 24px; cursor: pointer; background: var(--panel);
  transition: border-color 0.15s, background 0.15s;
}
.dropzone:hover, .dropzone.over { border-color: var(--accent); background: var(--accent-soft); }
.dz-icon { font-size: 40px; }
.dz-main { font-size: 16px; font-weight: 600; margin-top: 10px; }
.dz-sub { color: var(--text-dim); font-size: 13px; margin-top: 4px; }
.err { color: var(--danger); margin-top: 16px; }

.recent { max-width: 920px; margin: 48px auto 0; }
.recent h2 { font-size: 16px; color: var(--text-dim); margin-bottom: 14px; }
.cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 14px; }
.card {
  position: relative; display: flex; gap: 12px; padding: 14px;
  background: var(--panel); border: 1px solid var(--border); border-radius: 12px; cursor: pointer;
  transition: border-color 0.15s, transform 0.1s;
}
.card:hover { border-color: var(--accent); transform: translateY(-1px); }
.card-cover {
  width: 46px; height: 62px; flex: 0 0 auto; border-radius: 6px;
  background: linear-gradient(135deg, var(--accent), #b9a7ff);
  color: #fff; display: flex; align-items: center; justify-content: center;
  font-size: 22px; font-weight: 700;
}
.card-body { min-width: 0; flex: 1; }
.card-title { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.card-meta { color: var(--text-dim); font-size: 12px; margin-top: 2px; }
.del { position: absolute; top: 6px; right: 6px; padding: 2px 6px; color: var(--text-dim); opacity: 0; }
.card:hover .del { opacity: 1; }
</style>
