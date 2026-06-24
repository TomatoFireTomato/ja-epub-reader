<script setup>
import { ref, watch, onMounted, nextTick } from 'vue'

// 点击句子后，在点击位置浮现的气泡：列出分词与语法点供选择
const props = defineProps({
  sel: { type: Object, required: true },
  x: { type: Number, default: 0 },
  y: { type: Number, default: 0 }
})
const emit = defineEmits(['word', 'grammar', 'translate', 'close'])

const root = ref(null)
const style = ref({ left: '0px', top: '0px', visibility: 'hidden' })

// 渲染后测量自身尺寸，定位到点击点附近并夹在视口内（空间不足则翻到上方）
function place() {
  nextTick(() => {
    const el = root.value
    if (!el) return
    const r = el.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    const m = 8
    let left = props.x - r.width / 2
    left = Math.max(m, Math.min(left, vw - r.width - m))
    let top = props.y + 16
    if (top + r.height > vh - m) top = props.y - r.height - 16
    if (top < m) top = m
    style.value = { left: left + 'px', top: top + 'px', visibility: 'visible' }
  })
}

onMounted(place)
watch(() => [props.x, props.y, props.sel.loading, props.sel.words.length, props.sel.grammar.length, props.sel.error], place)
</script>

<template>
  <div ref="root" class="seg-bubble" :style="style">
    <button class="b-close" title="关闭" @click="emit('close')">✕</button>

    <div v-if="sel.loading" class="b-loading"><span class="b-spin" /> 分词中…</div>
    <div v-else-if="sel.error" class="b-error">{{ sel.error }}</div>

    <template v-else>
      <div v-if="sel.words.length" class="b-row">
        <button
          v-for="(w, i) in sel.words"
          :key="'w' + i"
          class="b-chip"
          :class="{ active: sel.active.type === 'word' && sel.active.index === i }"
          @click="emit('word', i)"
        >
          <span class="b-surface">{{ w.surface }}</span>
          <span v-if="w.reading" class="b-reading">{{ w.reading }}</span>
        </button>
      </div>

      <div v-if="sel.grammar.length" class="b-row b-grammar-row">
        <button
          v-for="(g, i) in sel.grammar"
          :key="'g' + i"
          class="b-chip g"
          :class="{ active: sel.active.type === 'grammar' && sel.active.index === i }"
          @click="emit('grammar', i)"
        >{{ g.point }}</button>
      </div>

      <button
        class="b-translate"
        :class="{ active: sel.active.type === 'translation' }"
        @click="emit('translate')"
      >🌐 整句翻译</button>

      <div v-if="!sel.words.length && !sel.grammar.length" class="b-empty">未识别到可拆解内容</div>
    </template>
  </div>
</template>

<style scoped>
.seg-bubble {
  position: fixed;
  z-index: 45;
  max-width: min(340px, 92vw);
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 12px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.22);
  padding: 10px 10px 10px;
  padding-right: 26px;
  animation: bubble-in 0.14s ease;
}
@keyframes bubble-in { from { opacity: 0; transform: translateY(4px) scale(0.98); } to { opacity: 1; transform: none; } }

.b-close { position: absolute; top: 4px; right: 4px; border: none; background: transparent; color: var(--text-dim); padding: 2px 6px; border-radius: 6px; cursor: pointer; font-size: 12px; }
.b-close:hover { background: var(--panel-2); }

.b-loading { display: flex; align-items: center; gap: 8px; color: var(--text-dim); padding: 4px 2px; }
.b-spin { width: 14px; height: 14px; border: 2px solid var(--border); border-top-color: var(--accent); border-radius: 50%; animation: spin 0.8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.b-error { color: var(--danger); font-size: 13px; padding: 2px; max-width: 260px; }
.b-empty { color: var(--text-dim); font-size: 13px; padding: 2px; }

.b-row { display: flex; flex-wrap: wrap; gap: 6px; }
.b-grammar-row { margin-top: 8px; padding-top: 8px; border-top: 1px dashed var(--border); }

.b-chip {
  display: inline-flex; align-items: baseline; gap: 4px;
  padding: 5px 9px; border: 1px solid var(--border); border-radius: 999px;
  background: var(--panel-2); color: var(--text); cursor: pointer; line-height: 1.2;
}
.b-chip:hover { border-color: var(--accent); }
.b-chip.active { background: var(--accent-soft); border-color: var(--accent); }
.b-surface { font-size: 15px; font-weight: 600; }
.b-reading { font-size: 11px; color: var(--text-dim); }
.b-chip.g { color: var(--accent); }

.b-translate {
  margin-top: 8px; width: 100%; text-align: center;
  padding: 6px 10px; border: 1px dashed var(--border); border-radius: 8px;
  background: transparent; color: var(--text-dim); cursor: pointer; font-size: 13px;
}
.b-translate:hover { border-color: var(--accent); color: var(--accent); }
.b-translate.active { background: var(--accent-soft); border-style: solid; border-color: var(--accent); color: var(--accent); }
</style>
