<script setup>
import { ref, shallowRef, onMounted } from 'vue'
import { parseEpub } from './lib/epub.js'
import { settings } from './store.js'
import { bookId, saveBook, getBook, updateProgress } from './lib/storage.js'
import Library from './components/Library.vue'
import Reader from './components/Reader.vue'
import SettingsDialog from './components/SettingsDialog.vue'

const book = shallowRef(null) // 解析后的书对象
const meta = ref(null) // { id, openedAt, lastIndex, lastScroll, title, creator }
const showSettings = ref(false)
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
    <header class="topbar">
      <span class="brand">📖<span class="brand-text"> 日语小说阅读器</span></span>
      <span v-if="book" class="book-title">· {{ book.title }}</span>
      <span class="spacer" />
      <button v-if="book" class="ghost" @click="closeBook">← 书库</button>
      <button class="ghost" @click="showSettings = true">⚙️ 设置</button>
    </header>

    <main class="main">
      <Reader
        v-if="book"
        :book="book"
        :meta="meta"
        @progress="onProgress"
      />
      <Library
        v-else
        :loading="loading"
        :error="error"
        @open-file="openFile"
        @open-saved="openSaved"
      />
    </main>

    <SettingsDialog v-model:open="showSettings" />
  </div>
</template>
