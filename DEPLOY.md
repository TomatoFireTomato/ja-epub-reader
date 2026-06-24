# 部署：前端上线 + 保留订阅（仅自己用）

目标：把**前端**发到在线网页（Vercel / Netlify / GitHub Pages），同时让 AI 解析继续走你的 **Claude 订阅额度**。

原理：订阅额度只能由跑在「装了 Claude Code 并登录订阅的机器」上的后端来用。所以架构是——

```
在线前端 (https)  ──►  隧道 (https)  ──►  你电脑上的后端 server/index.js  ──►  claude（你的订阅）
        带 x-api-token 访问密钥
```

> ⚠️ 个人订阅**只能自己用**，不能公开给别人（违反使用条款，且所有请求都吃你一个人的额度）。要给别人用请改用 API Key 模式（见 README）。

---

## 一次性准备：让后端能用订阅

在要跑后端的电脑上：

```bash
# 1. 安装并登录 Claude Code（用订阅账号登录，走浏览器 OAuth）
claude          # 首次运行会引导登录；登录后 claude --version 可用即可

# 2. 确认没有设置 ANTHROPIC_API_KEY（设了的话 claude 会改用 API 计费，而不是订阅）
echo $ANTHROPIC_API_KEY     # 应为空
```

> 本项目默认 Node 是 v14 太旧，已用 Volta 固定到 20。在 `ja-epub-reader/` 目录内运行命令会自动用 Node 20。

---

## 步骤 1：启动后端（带访问密钥）

```bash
cd ja-epub-reader
AUTH_TOKEN=随便设一个长口令 npm run server
```

启动日志里应看到 `访问密钥： 已启用 ✓`。后端监听 `http://localhost:8787`。

（可选，更安全）只允许你的前端域名访问：

```bash
AUTH_TOKEN=口令 ALLOW_ORIGIN=https://你的站点.vercel.app npm run server
```

## 步骤 2：把后端用隧道暴露成 https

后端在 localhost，在线前端（https）无法直接访问，需要一个 **https 隧道**。任选其一：

```bash
# Cloudflare Tunnel（免安装账号的临时隧道，最快）
cloudflared tunnel --url http://localhost:8787
# 输出里会给一个 https://xxxx.trycloudflare.com 地址

# 或 ngrok
ngrok http 8787
```

记下隧道给的 `https://...` 地址。

> 临时隧道每次重启地址会变；想要固定地址用 Cloudflare 命名隧道或 ngrok 固定域名。

## 步骤 3：构建并部署前端

```bash
cd ja-epub-reader
npm run build          # 产物在 dist/
```

把 `dist/` 部署到任意静态托管：

- **Vercel**：`vercel deploy --prebuilt` 或导入仓库，构建命令 `npm run build`，输出目录 `dist`。
- **Netlify**：构建命令 `npm run build`，发布目录 `dist`。
- **GitHub Pages**：把 `dist/` 推到 `gh-pages` 分支。

## 步骤 4：在网页里配置

打开你部署好的网址 → 右上角 **⚙️ 设置**：

| 字段 | 填什么 |
|---|---|
| AI 解析方式 | 本地 Claude Code（订阅额度） |
| 后端地址 | 步骤 2 的隧道 `https://...` 地址 |
| 访问密钥 | 步骤 1 设的 `AUTH_TOKEN` 同一个值 |
| 模型 | Sonnet 4.6（或按需） |

点 **测试连接**，看到「后端正常，密钥校验通过」即成功。之后点句子就会走你的订阅解析。

---

## 安全须知

- **访问密钥别外泄**：后端会执行 `claude`，拿到密钥+地址的人就能用你的额度。
- 建议设 `ALLOW_ORIGIN` 限制来源；隧道地址也尽量不要公开。
- 后端必须保持运行（你的电脑开着、`npm run server` 进程在跑、隧道在线），网页才能解析。
- 必须用 **https** 后端地址：https 网页调用 http 地址会被浏览器拦截（混合内容），所以一定要走隧道的 https。

## 故障排查

| 现象 | 原因 / 处理 |
|---|---|
| 测试连接：连不到后端 | 后端没跑 / 隧道没开 / 地址填错。先在浏览器直接打开 `隧道地址/api/health` 看是否返回 JSON。 |
| 测试连接：未检测到 claude | 后端那台机器没装 Claude Code 或未登录。跑 `claude --version` 验证。 |
| 测试连接：访问密钥不正确 | 设置里的密钥和后端 `AUTH_TOKEN` 不一致。 |
| 解析报错「找不到 claude 命令」| 后端进程的 PATH 里没有 `claude`，或用 `CLAUDE_BIN=/完整/路径/claude npm run server` 指定。 |
| 解析很慢/超时 | 首次调用较慢；或 claude 在等登录。先在后端机器手动 `claude -p "test"` 跑通。 |
| 想确认在用订阅而非 API | 确保后端机器 **没设** `ANTHROPIC_API_KEY` 环境变量。 |
