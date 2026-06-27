<script setup>
import { ref } from 'vue'
import { settings, MODELS, DEEPSEEK_MODELS } from '../store.js'
import { testConnection } from '../lib/ai.js'
import { llmState, loadModel } from '../lib/localllm.js'

const hasWebGPU = typeof navigator !== 'undefined' && !!navigator.gpu

function downloadLLM() {
  loadModel().catch(() => {}) // 错误已反映在 llmState
}

const props = defineProps({ open: Boolean })
const emit = defineEmits(['update:open'])

const testing = ref(false)
const testMsg = ref('')
const testOk = ref(false)

async function runTest() {
  testing.value = true
  testMsg.value = ''
  try {
    testMsg.value = await testConnection()
    testOk.value = true
  } catch (e) {
    testMsg.value = e.message || String(e)
    testOk.value = false
  } finally {
    testing.value = false
  }
}

function close() {
  emit('update:open', false)
  testMsg.value = ''
}
</script>

<template>
  <div v-if="open" class="overlay" @click.self="close">
    <div class="dialog scrollbar-thin">
      <div class="dlg-head">
        <h3>设置</h3>
        <button class="ghost" @click="close">✕</button>
      </div>

      <section class="sec">
        <h4>AI 解析方式</h4>
        <div class="modes">
          <label class="mode" :class="{ active: settings.mode === 'local' }">
            <input type="radio" value="local" v-model="settings.mode" />
            <div>
              <div class="mode-title">本地 Claude Code（订阅额度）</div>
              <div class="mode-desc">用你的 Claude 订阅，无需 API Key。需先运行 <code>npm run server</code>，且本机已安装并登录 Claude Code。</div>
            </div>
          </label>
          <label class="mode" :class="{ active: settings.mode === 'apikey' }">
            <input type="radio" value="apikey" v-model="settings.mode" />
            <div>
              <div class="mode-title">Anthropic API Key（按量计费）</div>
              <div class="mode-desc">浏览器直连 API，填入你的 Key。适合没有本地服务的场景。</div>
            </div>
          </label>
          <label class="mode" :class="{ active: settings.mode === 'deepseek' }">
            <input type="radio" value="deepseek" v-model="settings.mode" />
            <div>
              <div class="mode-title">DeepSeek API Key（按量计费）</div>
              <div class="mode-desc">浏览器直连 DeepSeek，填入你的 Key。便宜，在线静态站也能直接用。</div>
            </div>
          </label>
        </div>

        <div v-if="settings.mode === 'local'" class="field">
          <label>后端地址（本地留空；上线填隧道地址）</label>
          <input type="text" v-model="settings.serverUrl" placeholder="留空 = 本机；或 https://xxx.trycloudflare.com" autocomplete="off" />
          <div class="field-hint">前端上线后，填你用 Cloudflare Tunnel / ngrok 暴露的 <b>https</b> 后端地址。务必是 https，否则浏览器会拦截。</div>
        </div>
        <div v-if="settings.mode === 'local'" class="field">
          <label>访问密钥（上线必填）</label>
          <input type="password" v-model="settings.serverToken" placeholder="与后端 AUTH_TOKEN 一致" autocomplete="off" />
          <div class="field-hint">启动后端时设 <code>AUTH_TOKEN=...</code>，这里填同样的值，防止别人通过隧道地址白嫖你的额度。</div>
        </div>

        <div v-if="settings.mode === 'apikey'" class="field">
          <label>API Key</label>
          <input type="password" v-model="settings.apiKey" placeholder="sk-ant-..." autocomplete="off" />
          <div class="field-hint">仅保存在本地浏览器，不会上传到任何第三方服务器。</div>
        </div>
        <div v-if="settings.mode === 'apikey'" class="field">
          <label>自定义 API 地址（可选）</label>
          <input type="text" v-model="settings.baseUrl" placeholder="https://api.anthropic.com" />
        </div>

        <div v-if="settings.mode === 'deepseek'" class="field">
          <label>DeepSeek API Key</label>
          <input type="password" v-model="settings.deepseekKey" placeholder="sk-..." autocomplete="off" />
          <div class="field-hint">在 <code>platform.deepseek.com</code> 申请，仅保存在本地浏览器。</div>
        </div>
        <div v-if="settings.mode === 'deepseek'" class="field">
          <label>自定义 API 地址（可选）</label>
          <input type="text" v-model="settings.deepseekBaseUrl" placeholder="https://api.deepseek.com" />
        </div>

        <div class="field">
          <label>模型</label>
          <select v-if="settings.mode === 'deepseek'" v-model="settings.deepseekModel">
            <option v-for="m in DEEPSEEK_MODELS" :key="m.value" :value="m.value">{{ m.label }}</option>
          </select>
          <select v-else v-model="settings.model">
            <option v-for="m in MODELS" :key="m.value" :value="m.value">{{ m.label }}</option>
          </select>
        </div>

        <div class="test-row">
          <button class="primary" :disabled="testing" @click="runTest">
            {{ testing ? '测试中…' : '测试连接' }}
          </button>
          <span v-if="testMsg" class="test-msg" :class="{ ok: testOk, bad: !testOk }">{{ testMsg }}</span>
        </div>

        <div class="field" style="margin-top: 16px; padding-top: 14px; border-top: 1px solid var(--border)">
          <label class="checkbox">
            <input type="checkbox" v-model="settings.localSegment" /> 本地分词（kuromoji，离线、零 token）
          </label>
          <div class="field-hint">分词在浏览器本地完成，不花 token、可离线（首次加载 ~12MB 词典并缓存）。<b>仅给单词</b>，不识别语法点——需要语法点请关掉它、改用上面的 AI 分词。</div>
        </div>

        <div class="field" style="margin-top: 12px">
          <label class="checkbox">
            <input type="checkbox" v-model="settings.localLLM" /> 本地大模型（Qwen2.5-0.5B，词义 / 语法 / 翻译离线）
          </label>
          <div class="field-hint">勾选后，词义 / 语法 / 翻译改用浏览器内的 Qwen2.5-0.5B（<b>需要 WebGPU</b>，Chrome / Edge 113+）。首次需下载 <b>~483MB</b> 模型（缓存后复用），下载完成后才会启用。质量不及上面的 API，输出为朴素文本。建议配合「本地分词」实现基本离线。</div>
          <div v-if="settings.localLLM && !hasWebGPU" class="test-msg bad" style="margin-top:6px">
            你的浏览器不支持 WebGPU，无法运行本地模型。请用 Chrome / Edge 113+ 并启用 WebGPU，或改用上面的 API。
          </div>
          <div v-else-if="settings.localLLM" class="llm-row">
            <button v-if="llmState.status !== 'ready'" :disabled="llmState.status === 'loading'" @click="downloadLLM">
              {{ llmState.status === 'loading' ? `下载中… ${llmState.progress}%` : '下载 / 加载模型（~483MB）' }}
            </button>
            <span v-if="llmState.status === 'ready'" class="test-msg ok">模型已就绪 ✓，词义/语法/翻译将走本地</span>
            <span v-if="llmState.status === 'error'" class="test-msg bad">{{ llmState.error }}</span>
            <span v-else-if="llmState.status === 'loading' && llmState.file" class="field-hint" style="margin:0">{{ llmState.file }}</span>
          </div>
        </div>
      </section>

      <section class="sec">
        <h4>阅读偏好</h4>
        <div class="field row">
          <label>字号 {{ settings.fontSize }}px</label>
          <input type="range" min="12" max="40" v-model.number="settings.fontSize" />
        </div>
        <div class="field row">
          <label>行距 {{ settings.lineHeight }}</label>
          <input type="range" min="1.4" max="2.6" step="0.05" v-model.number="settings.lineHeight" />
        </div>
        <div class="field row">
          <label>正文宽度 {{ settings.maxWidth }}px</label>
          <input type="range" min="560" max="1000" step="20" v-model.number="settings.maxWidth" />
        </div>
        <div class="field">
          <label>主题</label>
          <select v-model="settings.theme">
            <option value="light">明亮</option>
            <option value="sepia">护眼（米黄）</option>
            <option value="dark">夜间</option>
          </select>
        </div>
        <div class="field">
          <label class="checkbox">
            <input type="checkbox" v-model="settings.vertical" /> 竖排阅读（日式纵书）
          </label>
        </div>
      </section>

      <div class="dlg-foot">
        <button class="primary" @click="close">完成</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.45); display: flex; align-items: center; justify-content: center; z-index: 50; padding: 20px; }
.dialog { width: 540px; max-width: 100%; max-height: 88vh; overflow: auto; background: var(--panel); border-radius: 16px; border: 1px solid var(--border); }
.dlg-head { display: flex; align-items: center; justify-content: space-between; padding: 16px 20px; border-bottom: 1px solid var(--border); position: sticky; top: 0; background: var(--panel); }
.dlg-head h3 { margin: 0; }

.sec { padding: 18px 20px; border-bottom: 1px solid var(--border); }
.sec h4 { margin: 0 0 12px; font-size: 14px; color: var(--text-dim); }

.modes { display: flex; flex-direction: column; gap: 10px; }
.mode { display: flex; gap: 10px; padding: 12px; border: 1px solid var(--border); border-radius: 10px; cursor: pointer; }
.mode.active { border-color: var(--accent); background: var(--accent-soft); }
.mode input { margin-top: 3px; }
.mode-title { font-weight: 600; }
.mode-desc { font-size: 12px; color: var(--text-dim); margin-top: 3px; line-height: 1.6; }
.mode-desc code { background: var(--panel-2); padding: 1px 5px; border-radius: 4px; }

.field { margin-top: 14px; display: flex; flex-direction: column; gap: 6px; }
.field.row { flex-direction: row; align-items: center; justify-content: space-between; gap: 14px; }
.field.row label { white-space: nowrap; color: var(--text-dim); font-size: 13px; }
.field.row input[type='range'] { flex: 1; }
.field label { font-size: 13px; }
.field-hint { font-size: 12px; color: var(--text-dim); }
.checkbox { display: flex; align-items: center; gap: 8px; cursor: pointer; }

.test-row { margin-top: 14px; display: flex; align-items: center; gap: 12px; }
.llm-row { margin-top: 10px; display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.test-msg { font-size: 13px; }
.test-msg.ok { color: #2f9e44; }
.test-msg.bad { color: var(--danger); }

.dlg-foot { padding: 16px 20px; display: flex; justify-content: flex-end; }
</style>
