# CLAUDE.md

本文件为 Claude Code (claude.ai/code) 在本代码库中工作时提供指导。

## 项目概述

Typefun 是一个中文诗词打字练习应用，基于 Vue + Node MVS 架构（pnpm monorepo）。

## 常用命令

```bash
# 安装
pnpm install              # 安装依赖
pnpm run build:libs       # 构建 typing-core、speech-queue、key-sounds 包

# 开发
pnpm dev                  # 并行启动 API (8787) + Web (5173)
pnpm dev:api              # 仅启动 API
pnpm dev:web              # 仅启动 Web

# 测试
pnpm test                 # 运行所有测试（packages + apps/api）
pnpm --filter @typefun/typing-core test        # 单个包测试
pnpm --filter @typefun/typing-core test:watch  # 监听模式

# 语料数据
pnpm run corpus:seed      # 生成小样本语料（默认，CI 使用）
pnpm run corpus:import     # 导入完整唐诗/宋词（需 vendor/chinese-poetry）
pnpm run corpus:import-300 # 限制导入 300 首
```

## 架构

### 包结构

```
packages/
├── typing-core/   # 核心打字引擎（无 DOM 依赖）
│   ├── engine.ts  # 状态机：IDLE → TYPING → COMPLETE
│   ├── pinyin.ts  # 拼音规范化、flattenPoem
│   ├── stats.ts   # CPM/准确率计算
│   └── types.ts   # 共享 TypeScript 类型
├── speech-queue/  # Web Speech API 队列（FIFO，合并截断）
└── key-sounds/    # 机械键盘音效（manifest + 多音色采样）

apps/
├── api/           # Fastify 后端（端口 8787）
│   ├── app.ts     # 路由：/api/health、/api/poems、/api/poems/:id
│   └── corpus.ts  # 语料加载（分片 data/corpus/ 或回退 data/poems.json）
└── web/           # Vue 3 + Vue Router + Vite（端口 5173）
    ├── views/     # HomeView（课程列表）、PracticeView
    ├── components/ # PoemLineGrid、CharacterCell、TypingCompleteDialog
    └── lib/       # IME composable（useImeTyping）
```

### 数据流

1. `GET /api/poems` → Vue 获取诗词列表
2. `GET /api/poems/:id` → Vue 获取完整诗词，含 `lines[].hanzi` + `lines[].pinyin`
3. `useImeTyping()` composable 处理 IME 组合事件
4. `typing-core/engine.ts` 处理键盘事件 → 状态机更新
5. 完成后结果持久化到 `sessionStorage`

### 关键实现细节

- **IME 处理**: 隐藏 `<input>` + `compositionstart`/`compositionend` + `isComposing` 门禁
- **性能**: CharacterCell 组件使用 `v-memo` 避免 O(N) 重渲染
- **状态机**: `reduce(state, event) => state` 模式（无 class 单例）
- **API 代理**: Vite 开发服务器将 `/api/*` 代理到 `127.0.0.1:8787`

## 环境要求

- Node.js **≥ 20**
- pnpm **9+**

## 生产部署

- 说明与变量表见根目录 `README.md`「生产环境部署」：`Dockerfile` / `docker-compose.yml`、`vercel.json`、`VITE_API_BASE`、API 的 `HOST` / `PORT` / `STATIC_ROOT`。

## 关键文件

- `docs/technical-design-vue-node.md` — 完整技术规格
- `packages/typing-core/src/engine.ts` — 核心打字状态机
- `apps/api/src/app.ts` — Fastify 路由定义
- `apps/web/src/views/PracticeView.vue` — 主打字界面
