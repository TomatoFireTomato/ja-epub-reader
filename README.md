# 日语小说阅读器 · AI 句子解析

一个用来阅读**日语 EPUB 小说**的网页阅读器。阅读时**点击任意一句**，Claude 会自动解析这句话的结构，把里面的**语法、单词**拆开，给出**读音、词性、释义和整句翻译**。

![flow](https://img.shields.io/badge/Vue3-Vite-42b883) ![ai](https://img.shields.io/badge/AI-Claude-6d4aff)

## 在线体验

👉 **https://tomatofiretomato.github.io/ja-epub-reader/** （推送到 `main` 后由 GitHub Actions 自动构建发布）

> 在线版是静态托管，AI 解析需在 ⚙️ 设置里选择 **Anthropic API Key** 或 **DeepSeek API Key** 模式（填自己的 Key，浏览器直连即可用），或把**本地订阅后端**用隧道暴露后填入「后端地址」。详见 [DEPLOY.md](DEPLOY.md)。EPUB、设置、生词本都只存在你自己的浏览器里。

## 功能

- 📂 **读取本地 EPUB**：拖拽或选择本地 `.epub`，文件只存在你自己的浏览器里（IndexedDB），刷新后可继续阅读，自动记忆进度。
- 👆 **点击选句**：点击正文中的文字自动选中当前整句（正确处理日语标点与振假名 ruby）；点到空白处不响应并清除上次选中，也支持手动拖选任意片段。
- 🧠 **两步式 AI 解析（省 token）**：点句子后在**点击处弹出气泡**，列出该句的**单词**与**语法点**；点其中的词 / 语法点 / 「整句翻译」，**右侧抽屉**再按需展示详情（释义、原形、词性、用法、例句）。只为你真正想看的内容花 token。
- 📒 **生词本**：一键收藏单词，可导出 `.txt`（制表符分隔，方便导入 Anki）。
- 🎨 **阅读体验**：字号 / 行距 / 宽度可调，明亮 / 护眼 / 夜间主题，支持**竖排（日式纵书）**。
- 📄 **滚动 / 分页**两种阅读模式一键切换；分页模式像翻书一样（按钮 / 方向键 / 滑动翻页）。
- 🖥️ **沉浸模式**：一键收起顶栏与工具栏，最大化阅读区（顶部小条恢复）。手机 / 折叠屏 / 桌面自适应。

## 三种 AI 接入方式（自己配置）

打开右上角 **⚙️ 设置** 选择：

### 1. 本地 Claude Code（使用订阅额度，推荐）
用你已有的 **Claude 订阅**额度，不额外按量付费。原理是本地起一个小服务，把句子转发给你本机的 `claude` 命令。

前置条件：已安装 [Claude Code](https://docs.claude.com/claude-code) 并登录（`claude` 命令可用）。

```bash
npm install
npm run dev:all      # 同时启动前端(5173) 和本地服务(8787)
```

> 也可以分开运行：`npm run server` + `npm run dev`。

### 2. Anthropic API Key（按量计费）
不想跑本地服务时使用。在设置里填入 `sk-ant-...` 的 API Key，浏览器直连 Anthropic API。Key 只保存在你本地浏览器。

### 3. DeepSeek API Key（按量计费，便宜）
在设置里填入 DeepSeek 的 `sk-...`（在 [platform.deepseek.com](https://platform.deepseek.com) 申请），浏览器直连 DeepSeek（OpenAI 兼容接口，支持 CORS，**在线静态站也能直接用**）。模型可选 `deepseek-chat`（V3，推荐）或 `deepseek-reasoner`（R1）。Key 只保存在你本地浏览器。

> 模式 2、3 都只需前端：`npm install && npm run dev`。

## 部署到在线网页

- **给别人用 / 公开** → 用 **Anthropic / DeepSeek API Key 模式**（纯静态部署 `dist/`，访客各自填自己的 Key）。个人订阅不能共享。
- **只给自己用、想保留订阅** → 前端可以上线，但后端要跑在你装了 Claude Code 的机器上，通过隧道连接，并用访问密钥保护。完整步骤见 **[DEPLOY.md](DEPLOY.md)**。

设置里为此提供了两个字段（本地使用时留空即可）：
- **后端地址**：上线后填你的隧道 `https://...` 地址（留空 = 走本机 `/api`）。
- **访问密钥**：与后端环境变量 `AUTH_TOKEN` 一致，防止他人通过隧道地址盗用你的额度。

## 快速开始

```bash
cd ja-epub-reader
npm install
npm run dev:all      # 浏览器打开 http://localhost:5173
```

1. 把一本日语 `.epub` 拖进首页。
2. 进入阅读后，点击任意一句话。
3. 右侧面板显示翻译、单词与语法解析；点 ＋ 收藏到生词本。

## 模型选择

在设置里可切换 `Opus 4.8 / Sonnet 4.6 / Haiku 4.5`。日常解析推荐 **Sonnet 4.6**（速度与质量均衡），追求速度用 **Haiku 4.5**。

## 技术栈 / 结构

```
src/
  lib/
    epub.js       # JSZip 解析 EPUB（OPF/spine/目录/资源 → blob URL）
    sentence.js   # 日语断句 + 点击坐标 → 整句 DOM Range（跳过 ruby 注音）
    ai.js         # 两种模式的 AI 客户端 + 结构化输出 schema
    storage.js    # IndexedDB 书库与阅读进度
  components/
    Library.vue       # 书库 / 导入
    Reader.vue        # 阅读器（目录 / 渲染 / 选句 / 进度）
    AnalysisPanel.vue # 解析结果 + 生词本
    SettingsDialog.vue# AI 与阅读设置
  store.js        # 设置 & 生词本（localStorage 持久化）
server/
  index.js        # 本地服务：包装 `claude -p`，使用订阅额度
```

## 常见问题

- **点击没反应 / 没高亮？** 句子高亮使用 CSS Custom Highlight API，请使用较新的 Chrome / Edge / Safari。即使不显示高亮，解析仍可正常进行。
- **本地模式报「连接本地服务失败」？** 确认 `npm run server` 正在运行，且终端里 `claude` 命令可用（可用 `claude --version` 检查）。
- **想换 `claude` 路径？** 启动服务时设置环境变量：`CLAUDE_BIN=/path/to/claude npm run server`。
- **竖排时滚动方向？** 竖排为日式纵书，横向滚动（向左翻）。

## 隐私

EPUB 文件、设置、生词本、API Key 全部保存在本地浏览器/本机，不上传到除 Anthropic（解析请求）以外的任何服务器。
