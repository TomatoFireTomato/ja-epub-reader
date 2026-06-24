<script setup>
import { ref, computed } from 'vue'
import { vocab, addVocab, removeVocab, isInVocab, exportVocab } from '../store.js'

const props = defineProps({
  sel: { type: Object, required: true }
})
const emit = defineEmits(['retry', 'close'])

const tab = ref('analysis')

const activeWord = computed(() =>
  props.sel.active.type === 'word' ? props.sel.words[props.sel.active.index] : null
)
const activeGrammar = computed(() =>
  props.sel.active.type === 'grammar' ? props.sel.grammar[props.sel.active.index] : null
)

function vkey(w) {
  return { surface: w.surface, reading: (w.detail && w.detail.reading) || w.reading || '' }
}
function inVocab(w) { return isInVocab(vkey(w)) }
function saveWord(w) {
  const d = w.detail || {}
  addVocab({ surface: w.surface, reading: d.reading || w.reading || '', lemma: d.lemma, pos: d.pos || w.pos, meaning: d.meaning })
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
        <button class="tab" :class="{ active: tab === 'analysis' }" @click="tab = 'analysis'">详情</button>
        <button class="tab" :class="{ active: tab === 'vocab' }" @click="tab = 'vocab'">
          生词本<span v-if="vocab.length" class="badge">{{ vocab.length }}</span>
        </button>
      </div>
      <button class="ghost close" title="收起" @click="emit('close')">✕</button>
    </div>

    <!-- 详情 -->
    <div v-show="tab === 'analysis'" class="body">
      <div v-if="!sel.sentence" class="hint">
        <div class="hint-icon">👆</div>
        点击正文中的句子，在弹出的气泡里选单词 / 语法点 / 整句翻译，详情会显示在这里。
      </div>

      <template v-else>
        <div class="sentence">{{ sel.sentence }}</div>

        <div v-if="sel.error" class="error">
          <p>{{ sel.error }}</p>
          <button class="primary" @click="emit('retry')">重试</button>
        </div>

        <div v-else-if="!sel.active.type" class="hint sub">在气泡里点一个单词、语法点或「整句翻译」。</div>

        <!-- 单词详情 -->
        <section v-else-if="sel.active.type === 'word' && activeWord" class="block">
          <div class="block-title">单词</div>
          <div v-if="activeWord.loading" class="loading"><span class="spinner" /> 加载中…</div>
          <div v-else-if="activeWord.error" class="error-sm">{{ activeWord.error }}</div>
          <template v-else-if="activeWord.detail">
            <div class="detail-head">
              <span class="surface">{{ activeWord.surface }}</span>
              <span v-if="activeWord.detail.reading" class="reading-sm">{{ activeWord.detail.reading }}</span>
              <span v-if="activeWord.detail.pos" class="pos">{{ activeWord.detail.pos }}</span>
              <button class="add ghost" :disabled="inVocab(activeWord)" @click="saveWord(activeWord)">
                {{ inVocab(activeWord) ? '已收藏' : '＋ 收藏' }}
              </button>
            </div>
            <div class="word-mean">{{ activeWord.detail.meaning }}</div>
            <div v-if="activeWord.detail.lemma && activeWord.detail.lemma !== activeWord.surface" class="word-note">原形：{{ activeWord.detail.lemma }}</div>
            <div v-if="activeWord.detail.note" class="word-note">{{ activeWord.detail.note }}</div>
          </template>
        </section>

        <!-- 语法详情 -->
        <section v-else-if="sel.active.type === 'grammar' && activeGrammar" class="block">
          <div class="block-title">语法点</div>
          <div v-if="activeGrammar.loading" class="loading"><span class="spinner" /> 加载中…</div>
          <div v-else-if="activeGrammar.error" class="error-sm">{{ activeGrammar.error }}</div>
          <template v-else-if="activeGrammar.detail">
            <div class="g-point">{{ activeGrammar.point }}</div>
            <div class="g-exp">{{ activeGrammar.detail.explanation }}</div>
            <div v-if="activeGrammar.detail.example" class="g-ex">例：{{ activeGrammar.detail.example }}</div>
          </template>
        </section>

        <!-- 整句翻译 -->
        <section v-else-if="sel.active.type === 'translation'" class="block">
          <div class="block-title">整句翻译</div>
          <div v-if="sel.translationLoading" class="loading"><span class="spinner" /> 翻译中…</div>
          <div v-else-if="sel.translationError" class="error-sm">{{ sel.translationError }}</div>
          <template v-else-if="sel.translation">
            <div v-if="sel.translation.reading" class="reading">{{ sel.translation.reading }}</div>
            <div class="translation">{{ sel.translation.translation }}</div>
          </template>
        </section>
      </template>
    </div>

    <!-- 生词本 -->
    <div v-show="tab === 'vocab'" class="body">
      <div v-if="!vocab.length" class="hint">还没有收藏的单词。<br />在单词详情里点「＋ 收藏」。</div>
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
.hint { color: var(--text-dim); text-align: center; padding: 40px 16px; line-height: 1.8; }
.hint.sub { padding: 20px 8px; font-size: 14px; }
.hint-icon { font-size: 30px; margin-bottom: 8px; }

.sentence { font-size: 17px; line-height: 1.7; padding: 12px; background: var(--panel-2); border-radius: 10px; border: 1px solid var(--border); margin-bottom: 14px; }

.loading { display: flex; align-items: center; gap: 10px; color: var(--text-dim); padding: 12px 4px; }
.spinner { width: 16px; height: 16px; border: 2px solid var(--border); border-top-color: var(--accent); border-radius: 50%; animation: spin 0.8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.error { color: var(--danger); }
.error p { margin: 0 0 10px; word-break: break-word; }
.error-sm { color: var(--danger); font-size: 13px; padding: 6px 0; word-break: break-word; }

.block { margin-bottom: 16px; }
.block-title { font-size: 12px; font-weight: 700; color: var(--text-dim); letter-spacing: 0.04em; margin-bottom: 8px; }

.reading { color: var(--text-dim); font-size: 13px; margin-bottom: 6px; }
.translation { font-size: 16px; line-height: 1.7; }

.detail-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.surface { font-size: 18px; font-weight: 700; }
.reading-sm { color: var(--text-dim); font-size: 13px; }
.pos { font-size: 11px; color: var(--accent); background: var(--accent-soft); border-radius: 6px; padding: 1px 6px; }
.add { margin-left: auto; padding: 2px 8px; font-size: 13px; }
.word-mean { margin-top: 8px; line-height: 1.7; font-size: 15px; }
.word-note { margin-top: 4px; font-size: 12px; color: var(--text-dim); }
.g-point { font-weight: 700; font-size: 16px; }
.g-exp { margin-top: 8px; line-height: 1.7; }
.g-ex { margin-top: 6px; font-size: 13px; color: var(--text-dim); }

.vocab-actions { display: flex; justify-content: flex-end; margin-bottom: 10px; }
.vocab-item { padding: 10px; border: 1px solid var(--border); border-radius: 10px; margin-bottom: 8px; }
.vocab-main { display: flex; align-items: center; gap: 8px; }
.vocab-main .del { margin-left: auto; color: var(--text-dim); padding: 2px 6px; }
</style>
