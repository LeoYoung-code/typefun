# Typefun

古诗词拼音打字练习（长期自用）。仓库内同时保留 **静态 MVP**（`index.html`）与 **设计文档中的 Vue + Node MVS**（monorepo）。

## 已实现（静态 MVP）

- 课程页、练习页、IME 合成门禁、统计、localStorage 续练、完成 `<dialog>`  
- 本地运行：先 `pnpm run build:libs`（生成 `typing-core` / `speech-queue` / `key-sounds` 的 `dist`），再 `python3 -m http.server 4173` → `http://127.0.0.1:4173/index.html`  
- 键声：`public/sounds` 默认为 **CC0 实录**（Cherry KC1000 + Kenney UI），来源见 `public/sounds/LICENSES.md`。可 `pnpm run fetch:keys` 重新下载打包（需网络、`unzip`、`ffmpeg`）。无网时可 `node scripts/generate-key-sounds.mjs` 生成合成占位。  
- 输错拼音字母时播放 `error.wav`（合成），与正确键的机械声互斥；由 `manifest.json` 的 `errorSample` 指定。

## Vue + Node（Phase 1 / MVS）

- **`packages/typing-core`**：拼音规范化、`flattenPoem`、练习状态机（`applyPracticeKey`）、统计与星级、`extractCompletedHanzi`；**Vitest** 单测。  
- **`packages/speech-queue`**：浏览器 Web Speech 朗读队列（完成序 FIFO、积压合并与截断）；**Vitest** 单测。  
- **`packages/key-sounds`**：Web Audio 机械键盘音效（manifest + 多音色随机采样）；**Vitest** 单测。  
- **`apps/api`**：Fastify，`GET /api/health`、`GET /api/poems`（分页）、`GET /api/poems/random`、`GET /api/poems/:id`。若存在 `data/corpus/index.json` 则从分片语料库读；否则回退 `data/poems.json`。  
- **`apps/web`**：Vue 3 + Vue Router + Vite，开发时代理 `/api` → `127.0.0.1:8787`。完成结算经 `sessionStorage` 回到首页弹窗（避免路由卸载丢 `<dialog>`）。

### 前置

- Node **≥ 20**、[pnpm](https://pnpm.io) 9+

### 命令

```bash
cd /Users/staff/project/AI/typefun
pnpm install
pnpm run build:libs   # 编译 typing-core、speech-queue、key-sounds（静态页与 Vue 均依赖）
pnpm dev          # 并行启动 API(8787) + Web(5173)
pnpm test         # typing-core + speech-queue + key-sounds + apps/api
```

浏览器打开：**http://127.0.0.1:5173/**（需 `pnpm dev` 同时起 API，否则首页会提示载入失败）。

### 数据说明

- `data/poems.json` 与 `data/poems.js` 当前内容一致；静态 MVP 仍读 `.js`，全栈优先读 **`data/corpus/`**（由脚本从 `poems.json` 生成或自 chinese-poetry 全量导入）。
- **生成小样本语料（默认与 CI 一致）：** `pnpm run corpus:seed` → 写入 `data/corpus/`。
- **导入全唐诗 + 全宋词（体积大、耗时长）：** 先 `git clone https://github.com/chinese-poetry/chinese-poetry.git vendor/chinese-poetry`，再执行 `pnpm run corpus:import`（依赖 `pinyin-pro` 逐字注音）。完成后可酌情将 `data/corpus/` 加入 `.gitignore` 或仅本地保留；仓库内保留 seed 版语料即可跑通测试与首页。
- **限量导入（例如 300 首，唐诗/宋词各约一半）：** `pnpm run corpus:import-300`（等价于 `--full --max=300`）。
- 查询参数：`GET /api/poems?category=tang|song_ci|all&page=1&pageSize=24`；`GET /api/poems/random?category=all` 用于首页「随机一首」。

## 生产环境部署

全栈生产由两部分组成：**静态前端**（`pnpm run build` 中的 `apps/web/dist`）与 **API**（`apps/api`，默认读仓库根目录 `data/`，与 `apps/api/dist` 的相对路径在运行时解析为 **`/data`**，与 Docker 镜像布局一致）。

### 环境变量

| 作用 | 变量 | 说明 |
|------|------|------|
| API | `PORT` | 监听端口，默认 `8787` |
| API | `HOST` | 监听地址；容器或公网部署请使用 **`0.0.0.0`**（默认 `127.0.0.1` 仅本机） |
| API | `STATIC_ROOT` | 若设置，则在该目录托管前端静态文件，并对非 `/api` 的 GET/HEAD 回退 **`index.html`**（Vue Router history） |
| 前端构建 | `VITE_API_BASE` | 仅当浏览器访问的站点与 API **不同源** 时设置，为 API 根 URL（**不要**尾斜杠），例如 `https://api.example.com`。请求会变为 `VITE_API_BASE + '/api/...'`。同域部署（Docker 单容器、Nginx 同 host 反代）**留空** |

示例见 `apps/web/.env.production.example`。

### 方式一：Docker 单容器（推荐）

仓库根目录提供 `Dockerfile` 与 `docker-compose.yml`：镜像内同时包含 API、`apps/web` 构建产物与 **`/data` 语料**。

```bash
docker compose build
docker compose up -d
# 浏览器打开 http://127.0.0.1:8787/  ，健康检查：GET http://127.0.0.1:8787/api/health
```

自定义语料可在构建前替换仓库内 `data/`，或挂载只读卷到容器内 **`/data`**（需与镜像内目录结构一致：`poems.json` 或 `corpus/index.json` + `corpus/shards/`）。

### 方式二：Vercel 托管静态前端

根目录 `vercel.json` 已配置：在 **仓库根** 作为项目根目录导入，安装 `pnpm install`、构建 `pnpm run build`，输出目录 **`apps/web/dist`**，并对 SPA 做 `index.html` 回退（具体以 [Vercel 静态资源优先](https://vercel.com/docs/build-output-api/v3#vercel-primitives) 为准）。

**Vercel 默认不提供本仓库的 Node API**，请另行部署 API（Railway、Fly.io、自有服务器等），并在 Vercel 项目环境变量中设置 **`VITE_API_BASE`** 指向该 API 的 origin。API 已启用 `@fastify/cors`（`origin: true`），允许浏览器跨域调用。

### 方式三：自建反代（Nginx 等同域）

将 **`/`** 指向前端静态目录，**`/api`** 反代到 Fastify（例如 `127.0.0.1:8787`）。此时前端构建 **不要** 设置 `VITE_API_BASE`，由浏览器继续请求相对路径 `/api/...`。

```nginx
location /api/ {
  proxy_pass http://127.0.0.1:8787;
  proxy_http_version 1.1;
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto $scheme;
}
```

### 仅部署 API（pnpm deploy）

在已 `pnpm run build` 的机器上可生成可拷贝目录：

```bash
pnpm --filter @typefun/api deploy --prod ./deploy/api
# 在 deploy/api 下：NODE_ENV=production HOST=0.0.0.0 PORT=8787 node dist/index.js
# 语料仍需在运行环境中提供：与 dist 相对的 ../../../data（即常见布局下仓库根目录的 data）
```

## 文档

- 全栈方案与 UI 规格：`docs/technical-design-vue-node.md`  
- 调研报告：`docs/Typefun-gemini.pdf`
