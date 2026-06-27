<script setup>
import { ref, shallowRef, onMounted } from 'vue'
import { parseEpub } from './lib/epub.js'
import { settings, ui } from './store.js'
import { bookId, saveBook, getBook, updateProgress } from './lib/storage.js'
import Library from './components/Library.vue'
import Reader from './components/Reader.vue'
import SettingsDialog from './components/SettingsDialog.vue'

const book = shallowRef(null) // 解析后的书对象
const meta = ref(null) // { id, openedAt, lastIndex, lastScroll, title, creator }
const loading = ref(false)
const error = ref('')

async function openFile(file) {
  error.value = ''
  loading.value = true
  try {
    const id = bookId(file)
    const buf = await file.arrayBuffer()
    const parsed = await parseEpub(buf)
    // 保存原文件以便下次直接打开
    let rec = await getBook(id)
    if (!rec) {
      rec = { id, title: parsed.title, creator: parsed.creator, blob: file, lastIndex: 0, lastScroll: 0 }
    }
    rec.openedAt = Date.now()
    await saveBook(rec)
    book.value = parsed
    meta.value = rec
  } catch (e) {
    error.value = '打开 EPUB 失败：' + (e.message || e)
  } finally {
    loading.value = false
  }
}

async function openSaved(rec) {
  error.value = ''
  loading.value = true
  try {
    const parsed = await parseEpub(rec.blob)
    rec.openedAt = Date.now()
    await saveBook(rec)
    book.value = parsed
    meta.value = rec
  } catch (e) {
    error.value = '打开 EPUB 失败：' + (e.message || e)
  } finally {
    loading.value = false
  }
}

function closeBook() {
  if (book.value && book.value.revoke) book.value.revoke()
  book.value = null
  meta.value = null
}

function onProgress(patch) {
  if (!meta.value) return
  Object.assign(meta.value, patch)
  updateProgress(meta.value.id, patch)
}
</script>

<template>
  <div class="app" :data-theme="settings.theme">
    <!-- 顶栏仅在书库页显示；阅读时只有一层阅读工具栏 -->
    <header v-show="!book" class="topbar">
      <span class="brand">📖<span class="brand-text"> 外语小说阅读器</span></span>
      <span class="spacer" />
      <button class="ghost" @click="ui.showSettings = true">⚙️ 设置</button>
    </header>

    <!-- 沉浸模式下的浮动恢复按钮 -->
    <button v-if="ui.immersive && book" class="immersive-restore" title="显示工具栏" @click="ui.immersive = false">⌄</button>

    <main class="main">
      <Reader
        v-if="book"
        :book="book"
        :meta="meta"
        @progress="onProgress"
        @close="closeBook"
      />
      <Library
        v-else
        :loading="loading"
        :error="error"
        @open-file="openFile"
        @open-saved="openSaved"
      />
    </main>

    <SettingsDialog v-model:open="ui.showSettings" />
  </div>
</template>
