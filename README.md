# Typefun

古诗词拼音打字练习（长期自用）。仓库内同时保留 **静态 MVP**（`index.html`）与 **设计文档中的 Vue + Node MVS**（monorepo）。

## 已实现（静态 MVP）

- 课程页、练习页、IME 合成门禁、统计、localStorage 续练、完成 `<dialog>`  
- 本地运行：`python3 -m http.server 4173` → `http://127.0.0.1:4173/index.html`

## Vue + Node（Phase 1 / MVS）

- **`packages/typing-core`**：拼音规范化、`flattenPoem`、练习状态机（`applyPracticeKey`）、统计与星级；**Vitest** 单测。  
- **`apps/api`**：Fastify，`GET /api/health`、`/api/poems`、`/api/poems/:id`，数据来自 `data/poems.json`。  
- **`apps/web`**：Vue 3 + Vue Router + Vite，开发时代理 `/api` → `127.0.0.1:8787`。完成结算经 `sessionStorage` 回到首页弹窗（避免路由卸载丢 `<dialog>`）。

### 前置

- Node **≥ 20**、[pnpm](https://pnpm.io) 9+

### 命令

```bash
cd /Users/staff/project/AI/typefun
pnpm install
pnpm dev          # 并行启动 API(8787) + Web(5173)
pnpm test         # typing-core + apps/api（Vitest / fastify.inject）
```

浏览器打开：**http://127.0.0.1:5173/**（需 `pnpm dev` 同时起 API，否则首页会提示载入失败）。

### 数据说明

- `data/poems.json` 与 `data/poems.js` 当前内容一致；静态 MVP 仍读 `.js`，全栈读 `.json`。后续可改为代码生成或单一数据源。

## 文档

- 全栈方案与 UI 规格：`docs/technical-design-vue-node.md`  
- 调研报告：`docs/Typefun-gemini.pdf`
