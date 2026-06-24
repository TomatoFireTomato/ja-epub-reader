<script setup>
import { ref } from 'vue'
import { vocab, addVocab, removeVocab, isInVocab, exportVocab } from '../store.js'

const props = defineProps({
  state: { type: Object, required: true } // { loading, error, result, sentence }
})
const emit = defineEmits(['retry', 'close'])

const tab = ref('analysis')
const copied = ref(false)

function saveWord(w) {
  addVocab({ surface: w.surface, reading: w.reading, lemma: w.lemma, pos: w.pos, meaning: w.meaning })
}

function copyResult() {
  const r = props.state.result
  if (!r) return
  let txt = props.state.sentence + '\n'
  if (r.reading) txt += '【读音】' + r.reading + '\n'
  txt += '【翻译】' + (r.translation || '') + '\n'
  if (r.words?.length) {
    txt += '【单词】\n'
    for (const w of r.words) txt += `  ${w.surface}（${w.reading || ''}）${w.pos || ''} — ${w.meaning}\n`
  }
  if (r.grammar?.length) {
    txt += '【语法】\n'
    for (const g of r.grammar) txt += `  ${g.point}：${g.explanation}\n`
  }
  if (r.structure) txt += '【结构】' + r.structure + '\n'
  navigator.clipboard?.writeText(txt)
  copied.value = true
  setTimeout(() => (copied.value = false), 1500)
}

function downloadVocab() {
  const blob = new Blob([exportVocab()], { type: 'text/plain;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = '生词本.txt'
  a.click()
  URL.revokeObjectURL(a.href)
}
</script>

<template>
  <aside class="panel scrollbar-thin">
    <div class="panel-head">
      <div class="tabs">
        <button class="tab" :class="{ active: tab === 'analysis' }" @click="tab = 'analysis'">解析</button>
        <button class="tab" :class="{ active: tab === 'vocab' }" @click="tab = 'vocab'">
          生词本<span v-if="vocab.length" class="badge">{{ vocab.length }}</span>
        </button>
      </div>
      <button class="ghost close" title="收起" @click="emit('close')">✕</button>
    </div>

    <!-- 解析 -->
    <div v-show="tab === 'analysis'" class="body">
      <div v-if="!state.sentence" class="hint">
        <div class="hint-icon">👆</div>
        点击正文中的任意一句，开始解析。<br />也可以拖拽选择任意片段。
      </div>

      <template v-else>
        <div class="sentence">{{ state.sentence }}</div>

        <div v-if="state.loading" class="loading">
          <span class="spinner" /> Claude 正在解析…
        </div>

        <div v-else-if="state.error" class="error">
          <p>{{ state.error }}</p>
          <button class="primary" @click="emit('retry')">重试</button>
        </div>

        <template v-else-if="state.result">
          <section v-if="state.result.reading" class="block">
            <div class="block-title">读音</div>
            <div class="reading">{{ state.result.reading }}</div>
          </section>

          <section class="block">
            <div class="block-title">翻译</div>
            <div class="translation">{{ state.result.translation }}</div>
          </section>

          <section v-if="state.result.words?.length" class="block">
            <div class="block-title">单词（点 + 收藏）</div>
            <div v-for="(w, i) in state.result.words" :key="i" class="word">
              <div class="word-main">
                <span class="surface">{{ w.surface }}</span>
                <span v-if="w.reading" class="reading-sm">{{ w.reading }}</span>
                <span v-if="w.pos" class="pos">{{ w.pos }}</span>
                <button class="add ghost" :disabled="isInVocab(w)" @click="saveWord(w)">
                  {{ isInVocab(w) ? '已收藏' : '＋' }}
                </button>
              </div>
              <div class="word-mean">{{ w.meaning }}</div>
              <div v-if="w.lemma && w.lemma !== w.surface" class="word-note">原形：{{ w.lemma }}</div>
              <div v-if="w.note" class="word-note">{{ w.note }}</div>
            </div>
          </section>

          <section v-if="state.result.grammar?.length" class="block">
            <div class="block-title">语法</div>
            <div v-for="(g, i) in state.result.grammar" :key="i" class="grammar">
              <div class="g-point">{{ g.point }}</div>
              <div class="g-exp">{{ g.explanation }}</div>
              <div v-if="g.example" class="g-ex">例：{{ g.example }}</div>
            </div>
          </section>

          <section v-if="state.result.structure" class="block">
            <div class="block-title">句子结构</div>
            <div class="structure">{{ state.result.structure }}</div>
          </section>

          <div class="actions">
            <button class="ghost" @click="copyResult">{{ copied ? '已复制 ✓' : '复制' }}</button>
            <button class="ghost" @click="emit('retry')">重新解析</button>
          </div>
        </template>
      </template>
    </div>

    <!-- 生词本 -->
    <div v-show="tab === 'vocab'" class="body">
      <div v-if="!vocab.length" class="hint">还没有收藏的单词。<br />在解析结果里点 ＋ 收藏单词。</div>
      <template v-else>
        <div class="vocab-actions">
          <button class="ghost" @click="downloadVocab">导出 .txt</button>
        </div>
        <div v-for="(w, i) in vocab" :key="i" class="vocab-item">
          <div class="vocab-main">
            <span class="surface">{{ w.surface }}</span>
            <span v-if="w.reading" class="reading-sm">{{ w.reading }}</span>
            <button class="del ghost" @click="removeVocab(i)">✕</button>
          </div>
          <div class="word-mean">{{ w.meaning }}</div>
        </div>
      </template>
    </div>
  </aside>
</template>

<style scoped>
.panel { height: 100%; display: flex; flex-direction: column; background: var(--panel); border-left: 1px solid var(--border); overflow: auto; }
.panel-head { display: flex; align-items: center; justify-content: space-between; padding: 8px 10px; border-bottom: 1px solid var(--border); position: sticky; top: 0; background: var(--panel); z-index: 1; }
.tabs { display: flex; gap: 4px; }
.tab { border: none; background: transparent; padding: 6px 12px; border-radius: 8px; color: var(--text-dim); }
.tab.active { background: var(--accent-soft); color: var(--accent); font-weight: 600; }
.badge { margin-left: 6px; background: var(--accent); color: #fff; border-radius: 10px; padding: 0 6px; font-size: 11px; }
.close { color: var(--text-dim); }

.body { padding: 14px; }
.hint { color: var(--text-dim); text-align: center; padding: 48px 16px; line-height: 1.8; }
.hint-icon { font-size: 30px; margin-bottom: 8px; }

.sentence { font-size: 17px; line-height: 1.7; padding: 12px; background: var(--panel-2); border-radius: 10px; border: 1px solid var(--border); margin-bottom: 14px; }

.loading { display: flex; align-items: center; gap: 10px; color: var(--text-dim); padding: 16px 4px; }
.spinner { width: 16px; height: 16px; border: 2px solid var(--border); border-top-color: var(--accent); border-radius: 50%; animation: spin 0.8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.error { color: var(--danger); }
.error p { margin: 0 0 10px; word-break: break-word; }

.block { margin-bottom: 16px; }
.block-title { font-size: 12px; font-weight: 700; color: var(--text-dim); letter-spacing: 0.04em; margin-bottom: 6px; }
.reading { color: var(--text-dim); }
.translation { font-size: 15px; line-height: 1.7; }

.word { padding: 10px; border: 1px solid var(--border); border-radius: 10px; margin-bottom: 8px; background: var(--panel-2); }
.word-main { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.surface { font-size: 16px; font-weight: 700; }
.reading-sm { color: var(--text-dim); font-size: 13px; }
.pos { font-size: 11px; color: var(--accent); background: var(--accent-soft); border-radius: 6px; padding: 1px 6px; }
.add { margin-left: auto; padding: 2px 8px; font-size: 13px; }
.word-mean { margin-top: 4px; line-height: 1.6; }
.word-note { margin-top: 3px; font-size: 12px; color: var(--text-dim); }

.grammar { padding: 10px; border-left: 3px solid var(--accent); background: var(--panel-2); border-radius: 0 8px 8px 0; margin-bottom: 8px; }
.g-point { font-weight: 700; }
.g-exp { margin-top: 4px; line-height: 1.6; }
.g-ex { margin-top: 4px; font-size: 13px; color: var(--text-dim); }
.structure { line-height: 1.7; }

.actions { display: flex; gap: 8px; margin-top: 8px; }

.vocab-actions { display: flex; justify-content: flex-end; margin-bottom: 10px; }
.vocab-item { padding: 10px; border: 1px solid var(--border); border-radius: 10px; margin-bottom: 8px; }
.vocab-main { display: flex; align-items: center; gap: 8px; }
.vocab-main .del { margin-left: auto; color: var(--text-dim); padding: 2px 6px; }
</style>
