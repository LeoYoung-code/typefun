# Typefun 技术设计（Vue 3 + Node.js）

> 依据：`docs/Typefun-gemini.pdf`（数字化古典文学教育平台技术构建与工程化演进）  
> 对照实现：当前仓库 MVP（纯静态 HTML/ESM + `localStorage`）  
> 目标：在**不推翻产品心智**的前提下，给出可落地的全栈演进蓝图，前端统一为 **Vue 3**，服务端为 **Node.js（TypeScript）**。

---

## 1. 设计文档对齐（PDF → 本方案）

| PDF 建议 | 本方案落地 |
|---------|-----------|
| TypeScript 全栈 | `apps/api`、`packages/typing-core` 强制 TS；`apps/web` 使用 `<script setup lang="ts">` |
| 整洁架构 / 领域逻辑与框架解耦 | 打字状态机、统计、拼音规范化放入 `packages/typing-core`，HTTP/WebSocket 仅作适配层 |
| IME 合成事件生命周期 | Vue 侧用隐藏 `<input>` + `compositionstart` / `compositionend` + `isComposing` 门禁（与现 MVP 一致思路） |
| 高性能逐字渲染 | Vue 3 使用 **`v-memo`** 或细粒度子组件 + **`shallowRef` 游标**，避免整篇 O(N) 重渲染 |
| 数据：chinese-poetry + PostgreSQL | 一期可继续 **JSON/种子 SQL**；二期 **COPY 批量导入 + `tsvector` 检索** |
| 排行榜 / 实时对战：Redis + Socket.io | 列为 **Phase 3**，API 先留扩展点（会话、房间 ID 类型） |
| PWA / 离线 | Phase 2：`workbox` 缓存壳资源；练习进度 **IndexedDB** 队列，联网后同步 |
| AI 伴练 | Phase 4，独立 BFF 路由，与核心练习域隔离 |

---

## 2. Step 0：范围与挑战（Scope Challenge）

### 2.1 已有代码可复用部分

- **数据形状**：`data/poems.js` 的 `lines[].hanzi` / `pinyin` 可直接作为 API DTO 与 `typing-core` 输入。
- **算法**：`src/pinyin.js`（声调剥离、`flattenPoem`）、`src/stats.js`（CPM/准确率）、`src/app.js` 中的 **`processKey` 状态机** — 应迁移为 **纯函数 + 不可变状态更新**，便于单测。

### 2.2 最小可用全栈（MVS）定义

在引入 PostgreSQL / Redis 之前，**MVS** 应满足：

1. Vue 单页：课程列表 + 练习页 + 完成结算（保持现有交互）。
2. Node API：提供 `GET /api/poems`、`GET /api/poems/:id`；可选 `GET /api/health`。
3. 进度：**仍以客户端为主**（`localStorage` 或 IndexedDB），API 仅下发诗词 — 降低首期运维面。

### 2.3 复杂度嗅觉

- **>8 文件或 >2 个新「服务类」**：若一期就上 DDD 六边形 + 微服务，属于过度设计。推荐 **pnpm monorepo + 两个 app + 一个 core 包** 即停。
- **自定义 IME**：禁止；只适配浏览器标准事件。

### 2.4 检索检查（内置能力）

- Vue 3 内置 **`v-memo`**（[Layer 1]）应对长列表/长诗逐字渲染。
- Node 内置 **`node:test`** 或生态 **Vitest** 测纯函数包（[Layer 1]）。
- 实时对战：**Socket.io** 为成熟默认（[Layer 1]），自研协议为 [Layer 3] 且不必要。

---

## 3. 总体架构

```
┌─────────────────────────────────────────────────────────────────┐
│                        Browser (Vue 3 + Vite)                    │
│  views: CourseView, PracticeView  │  stores: practiceSession      │
│  composables: useImeTyping()      │  (Pinia / 可选 composable)    │
└────────────────────────────┬────────────────────────────────────┘
                             │ REST (JSON)   │  (Phase 3) WebSocket
                             ▼               ▼
┌─────────────────────────────────────────────────────────────────┐
│              apps/api — Fastify + TypeScript                     │
│  routes/poems.ts  │  (Phase 2) routes/progress.ts (auth JWT)     │
│  (Phase 3) socket leaderboard                                    │
└────────────┬───────────────────────────────┬────────────────────┘
             │                                │
             ▼                                ▼
     ┌──────────────┐                 ┌──────────────┐
     │ PostgreSQL   │                 │ Redis (opt)  │
     │ poems, users │                 │ ZSET 排行    │
     └──────────────┘                 └──────────────┘

        packages/typing-core  ←── 被 web（可选打包）与 api（校验/反作弊）共同引用
```

### 3.1 请求与数据流（MVS）

```
User → Vue Router → PracticeView
                      │
                      ├─ fetch GET /api/poems/:id
                      │
                      └─ useTypingEngine(poem)  ──►  updates UI + local persist
```

### 3.2 练习域状态机（与现 MVP 等价）

ASCII（与实现注释建议放 `packages/typing-core/src/engine.ts` 顶部）：

```
                    ┌──────────────┐
                    │   IDLE       │
                    └──────┬───────┘
                           │ startPractice(poem)
                           ▼
                    ┌──────────────┐
              ┌────►│  TYPING      │◄────┐
              │     └──────┬───────┘     │
              │            │ key / bs    │
              │            ▼             │
              │     (cursor, buffer)     │
              │            │             │
              │            │ complete    │
              │            ▼             │
              │     ┌──────────────┐     │
              └─────│  COMPLETE    │     │
                    └──────────────┘     │
                           │ restart      │
                           └──────────────┘
```

**IME 并行状态（orthogonal）**：`composing === true` 时，忽略 `input` 对业务状态的提交；仅在 `compositionend` 后清空隐藏框（与 PDF 一致）。

---

## 4. 仓库结构（建议）

```
typefun/
  apps/
    web/                 # Vue 3 + Vite + Vue Router + Pinia
    api/                 # Fastify, tsx/node, OpenAPI 可选
  packages/
    typing-core/         # 无 DOM：normalizePinyin, flattenPoem, reduceTyping, calcStats
  data/                  # 种子诗词（迁移为 JSON，构建时复制或 API 读盘）
  docs/
```

- **DRY**：`typing-core` 单源；Web 端可直接 `import` workspace 包（Vite `optimizeDeps` 配置 `typing-core`）。
- **显式优于聪明**：引擎用 `reduce(state, event) => state`，避免 class 单例。

---

## 5. 前端设计（Vue 3）

### 5.1 技术选型

| 能力 | 选型 | 说明 |
|------|------|------|
| 框架 | Vue 3.5+ | Composition API |
| 构建 | Vite 6+ | 与 Vitest 统一 |
| 路由 | Vue Router 4 | `/`、`/practice/:poemId` |
| 状态 | Pinia | 课程列表缓存、用户偏好（主题） |
| HTTP | `fetch` + 薄封装 | 或 `ofetch`，避免重型 axios |
| CSS | 现有 `app.css` 变量迁入 `web/src/assets` | 保持深色古典风 |

### 5.2 组件边界

- `PoemLineGrid`：接收 `lines` + `cursor` + `typedBuffer` + `error`。
- `CharacterCell`：props 为 `unit`、`status: 'pending'|'current'|'done'|'punct'`、`typedSlice`。
- **性能**：对 `CharacterCell` 使用 **`v-memo="[status, typedSlice, unit.char]"`**，或父级 grid 仅在 `cursor` 变化时传参（父级用 `computed` 切片）。

### 5.3 IME Composable：`useImeTyping`

职责：

1. 暴露隐藏 `input` ref 与 `focus()`。
2. 监听 `keydown`（拉丁字母 + Backspace）与 `composition*`。
3. 向引擎派发 `TypingEvent`，**不**在 Vue 组件内散落 `preventDefault` 逻辑。

与 PDF 的跨平台差异：对 `compositionend` 与 `input` 顺序差异保持 **「仅以 `isComposing` 门禁 + 清空 value」** 的保守策略（现 MVP 已验证）。

### 5.4 与 React.memo 的对应

- PDF 建议 `React.memo` → Vue 侧 **`v-memo` + 子组件 props 稳定化**（`readonly` 数据结构）。

---

## 6. 后端设计（Node.js）

### 6.1 技术选型

| 能力 | 选型 | 说明 |
|------|------|------|
| 运行时 | Node 20 LTS | |
| 语言 | TypeScript strict | 与 core 共享类型 |
| HTTP | **Fastify** | schema 校验、低开销；也可用 Express，差异不大 |
| 校验 | `zod` 或 Fastify JSON Schema | DTO 与 OpenAPI 同源 |
| DB 驱动 | `pg` + 迁移 `node-pg-migrate` / Drizzle | 二期 |
| 缓存 | `ioredis` | 三期 |

### 6.2 API 草案（MVS）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/health` | 存活探针 |
| GET | `/api/poems` | 列表（id, title, author, unlocked, stars 占位） |
| GET | `/api/poems/:id` | 全文 DTO（lines） |

### 6.3 二期：进度与账号

- `POST /api/sessions` 签发 JWT（或长期自用可仅 cookie session）。
- `PUT /api/progress/:poemId`：服务端持久化，冲突策略 **Last-Write-Wins** 或版本号（`If-Match`）。

### 6.4 三期：实时与反作弊（对齐 PDF）

- **Socket.io**：房间 = 对战局；仅同步「已完成字数 / 行号」增量。
- **服务端校验**：击键间隔、CPM 上限审计；核心分数以 **服务端计时** 为准。
- **Redis `ZADD`**：排行榜；定时落库 PostgreSQL。

---

## 7. 数据模型（PostgreSQL，二期起）

```text
poem (id, slug, title, author_dynasty, body_json, search_tsv, created_at)
poem_tag (poem_id, tag_id)   -- 唐诗三百首、必修等
user (id, email, ...)
practice_run (id, user_id, poem_id, accuracy, cpm, duration_sec, created_at)
```

- **导入**：流式读 JSON → `COPY`（PDF 建议），避免逐条 INSERT。
- **搜索**：`tsvector` + GIN；作者/标题加权。

---

## 8. 测试策略（非协商项：必须写）

### 8.1 框架探测结论

当前仓库无 `package.json`；新栈引入后：

- **`packages/typing-core`**：**Vitest** — 100% 分支覆盖为目标（`processKey` / `backspace` / 标点跳过 / 完成边界）。
- **`apps/web`**：Vitest + `@vue/test-utils` 测 composable 与纯组件；**Playwright** 测 IME 相关路径（至少 Chromium）。
- **`apps/api`**：Vitest 或 `node:test` + `fastify.inject()` 测路由。

### 8.2 代码路径 → 测试覆盖示意

```
CODE PATH COVERAGE (typing-core)
================================
[+] reduceTyping(state, event)
    ├── [GAP→TEST] 正确字母推进、完成一字
    ├── [GAP→TEST] 错误字母 error 标记
    ├── [GAP→TEST] Backspace 仅 buffer / 跨字回退
    ├── [GAP→TEST] 标点自动跳过
    └── [GAP→TEST] 最后一字完成后状态

USER FLOW (Playwright) [→E2E]
================================
[+] 打开练习 → 输入正确拼音 → 进度增长 → 完成弹窗
[+] Esc / 返回课程
[+] 刷新后 localStorage 续练（MVS）
```

### 8.3 失败模式（样例）

| 失败模式 | 测试 | 用户可见 | 处理 |
|---------|------|----------|------|
| API 404 | inject / E2E | 空白或 toast | 路由级 ErrorBoundary + 重试 |
| localStorage 满 | 单测 mock | 静默失败 | 捕获 `QuotaExceededError`，降级内存会话 |
| WS 断连 | 三期 | 卡顿 | 心跳 + 自动重连 + 提示 |

---

## 9. 性能与部署

- **长诗**：`v-memo` + 避免在 `reduce` 中克隆整首诗词；`state` 用扁平 `units` 数组引用不变。
- **构建产物**：Nginx / CDN 托管 `web`；`api` 容器化；环境变量注入 DB URL。
- **日志**：`pino`（Fastify 默认）结构化日志。

---

## 10. 分阶段路线图（与 PDF 四阶段一致，略调栈名）

| 阶段 | 内容 | 交付物 |
|------|------|--------|
| **Phase 1** | Monorepo + `typing-core` + Vue 练习页迁移 + Fastify 读诗词 | 可部署 MVS |
| **Phase 2** | PostgreSQL 导入与检索；用户进度 API；PWA 壳 | 多端同步雏形 |
| **Phase 3** | Redis 排行 + Socket.io 房间 | 竞技闭环 |
| **Phase 4** | AI 伴练 BFF、错误热力推荐 | 增值模块 |

---

## 11. 明确 NOT in scope（本期设计不展开）

- 自研中文分词与多音字消歧（可用 **人工注音 JSON** 为主，`pinyin-pro` 仅作辅助校验）。
- 小程序原生端（除非单独立项）。
- 完全无服务器的 Serverless 大文件冷启动诗词库（与 PDF「亚秒搜索」目标冲突）。

---

## 12. 关键工程决策（摘要）

1. **引擎放 `packages/typing-core`**：满足 DRY、可测、未来反作弊服务端复用。  
2. **Vue 性能面：`v-memo` + 扁平状态**：对应 PDF 的 `React.memo` 建议。  
3. **MVS 不强绑 DB**：先 API 下发静态/种子数据，进度本地 — **最小差异迁移**自当前 MVP。  
4. **TypeScript strict + 契约测试**：API DTO 与 `typing-core` 类型共享（`z.infer` 或导出 interface）。

---

## 13. 产品 UI/UX 设计规格（`/plan-design-review` 落地）

> **预审结论：** 本技术设计 **有 UI 范围**（课程页、练习页、完成弹窗、顶栏），适用设计向评审。  
> **DESIGN.md：** 仓库内暂无；本节作为 **视觉与交互契约**，实施后可视情况抽离为根目录 `DESIGN.md`。  
> **既有资产：** 复用 `styles/app.css` 的 `:root` token 与版式节奏；Vue 迁移 = **搬迁而非重设计**，避免「模板感」换皮。

### 13.1 Step 0：设计完备度评分

| 维度 | 修订前 | 修订后（本节目标） | 到 10 分还缺什么 |
|------|--------|-------------------|------------------|
| 总体 | **4/10**（偏后端与组件名，缺可见规格） | **8/10** | 实装后走 `/design-review` 截屏验收；动效时长需产品拍板 |
| 说明 | 工程师不知道空态/错态/键盘用户看到什么 | 补 IA、状态表、旅程、a11y | 用户实测 IME 边缘机型 |

**10/10 定义（本产品）：** 仅依赖本文 + 现有 CSS 变量，即可在 Vue 中复刻 MVP 的 **层级、对比度、关键状态与键盘路径**，且移动端首屏能看到 **第一个待输入字符**。

### 13.2 体验分类（App UI，非营销页）

- **类型：** 密工具型 **App UI**（练习效率优先）。  
- **原则：** 冷静面层次、实用文案、少装饰；顶栏为唯一强品牌位。  
- **AI Slop 黑名单（显式禁止）：** 紫蓝渐变营销 Hero、三栏「图标+标题+两句」功能墙、通篇居中排版、装饰性 blob、用 Emoji 当视觉层级。  
- **已有审美锚点：** 深色径向背景 + 青绿 `--ok` / 玫红 `--focus` / 粉字错误底 — **保留**，与 PDF「深色护眼 + 古典意境」一致。

### 13.3 Pass 1 — 信息架构与首屏层级

**导航：** Vue Router：`/`（课程）、`/practice/:poemId`（练习）。顶栏右侧 **「课程页」** 始终可回列表；练习页显示 **「重打」**。

**屏幕骨架（ASCII）：**

```
┌────────────────────────────────────────────────────────────┐
│ Typefun          [课程页]  [重打]     ← topbar，练习页同构  │
├────────────────────────────────────────────────────────────┤
│  (/) 课程视图                                               │
│    ① H1 主标题（最大字号）                                   │
│    ② 副标题 muted                                            │
│    ③ 「继续上次」条（有进度才出现）← 与主网格同级显眼        │
│    ④ 课程卡片网格 ← 主工作区                                 │
├────────────────────────────────────────────────────────────┤
│  (/practice/:id) 练习视图                                    │
│    ① 诗题 H2 + 作者 muted                                    │
│    ② 打字面板（最大视觉重量，边框+浅底）                      │
│    ③ 底栏统计（muted，可换行；不得压扁②）                    │
└────────────────────────────────────────────────────────────┘
```

**约束崇拜（移动）：** `@media (max-width: 640px)` 时，**打字面板最小高度** 优先保证；底栏统计允许换行；**禁止**用大块固定底栏遮挡首屏首字。

### 13.4 Pass 2 — 交互状态表（用户可见）

| 功能 | LOADING | EMPTY | ERROR | SUCCESS | PARTIAL |
|------|---------|-------|-------|---------|---------|
| 课程列表（`GET /api/poems`） | 全页或网格区 **骨架卡片** + 文案「载入诗词…」 | 0 首：**温和说明**「暂无可练习内容」+ **重试/反馈入口**（长期自用可简化为静态提示） | 内联或轻 Toast：「网络异常」+ **重试**；勿静默空白 | 卡片网格 + 星级/锁定态 | — |
| 进入练习（`GET /api/poems/:id`） | 面板内 **居中 Spinner**（不闪全页） | — | **404**：「未找到该篇」+ **回课程** 主按钮 | 渲染逐字格 + 自动聚焦隐藏输入 | 本地有缓存时可 **先用缓存渲染** 条提示（Phase 2 可选） |
| 打字练习 | — | — | **错音**：当前格 `--err` + 字母级 err（沿用 MVP） | **完成**：`<dialog>` 展示星级、准确率、CPM、用时 | **中途离开**：静默写 `localStorage`；回列表不打断 |
| 「继续上次」 | — | 无进度：**整块不展示**（与 MVP 一致） | — | 展示摘要 + **继续** 主按钮 | — |
| 完成 `<dialog>` | — | — | — | 主按钮「回到课程」；**`aria-labelledby` 指向标题** | **`Esc` 关闭**；**不**将「点击遮罩关闭」作为唯一路径（防误触）；若实现遮罩关，须在实现稿注明 |

### 13.5 Pass 3 — 用户旅程与情绪弧

| Step | 用户行为 | 预期情绪 | 设计支撑 |
|------|----------|----------|----------|
| 1 | 打开 `/` | 安心、可立即开始 | 深色柔和背景；标题明确；有进度时 **继续** 显眼 |
| 2 | 点「开始练习」 | 专注、进入心流 | 练习页 **隐藏课程噪音**；自动聚焦输入；统计不抢戏 |
| 3 | 打错 | 轻微挫败但 **可理解** | 即时局部高亮；不弹窗打断 |
| 4 | 完成 | 成就感 | Dialog 星级 + 数据摘要；一键回课程 |
| 5 | 按 Esc | 可控退出 | 与「课程页」等价；**须在 UI 某处写明**（见 13.10） |

**时间尺度：** 5 秒内需看懂「这是打字背诗」；5 分钟内完成一首不因 UI 迷路；长期自用信任来自 **进度不丢、错因可见**。

### 13.6 Pass 4 — 特异性清单（替代「干净现代」空话）

| 元素 | 规格（继承 MVP） |
|------|------------------|
| 字体 | UI：`PingFang SC` / `Noto Sans SC` / `Microsoft YaHei`；拼音格：`Menlo, Monaco, Consolas` |
| 主标题 `/` | `44px` desktop → `34px` ≤640px（与现 CSS 一致） |
| 汉字格 | desktop `62px` → 小屏阶梯降至 `34px`（保持可点可看） |
| 拼音格 | `36px` → `20px`（小屏） |
| 圆角 | 卡片 `14px`；按钮 `10px`；面板 `14px` — **不要随意统一更大圆角** |
| 焦点 | 当前字 **底边框** `--focus`；拼音 `next` 字母下划线 |
| 动效 | **首版不新增** 大动画；光标若闪烁用 **CSS `animation`**，不用 `setInterval`（对齐 PDF） |

### 13.7 Pass 5 — 设计系统对齐（Token）

无独立 `DESIGN.md` 前，**以代码为真源**：Vue 项目迁移 `styles/app.css` 的 `:root` 变量：

`--bg`, `--bg-2`, `--text`, `--muted`, `--line`, `--ok`, `--err`, `--focus`, `--card`, `--cell-gap`。

新增语义色须 **走变量**，禁止散写 hex。

### 13.8 Pass 6 — 响应式与无障碍（a11y）

- **键盘：** 所有可见按钮可 `Tab` 聚焦；**可见 `:focus-visible` 轮廓**（与深色对比足够，可用 `outline: 2px solid var(--focus)`）。隐藏 IME `input` **`tabindex="-1"`** 且 `aria-hidden="true"`，避免读屏焦点掉进「黑洞」—— 读屏用户以 **可见提示**「请使用键盘输入拼音」+ 课程/练习 **可操作控件** 为主路径。  
- **Dialog：** `role="dialog"`（原生 `dialog` 已具备）、`aria-labelledby`、打开时 **焦点陷阱**（`showModal` 默认）+ 关闭后焦点回到触发元素或「课程」按钮。  
- **触控：** 卡片上 **「开始练习」** 等主按钮 **最小点击高宽 ≥ 44×44 CSS px**（可用 `min-height` + `padding`）。  
- **对比度：** 正文 `--text` on `--bg` 与 **错误/成功** 状态需满足 **WCAG AA**（实现前用 DevTools 对比度检查；若 `--muted` 用于长正文则仅作次要说明，不作主文）。  
- **减少动效：** `prefers-reduced-motion: reduce` 时关闭装饰动画（若有）。

### 13.9 Pass 7 — 待决策（实现前需拍板）

| 决策 | 若推迟 | **本稿建议** |
|------|--------|--------------|
| 是否暴露快捷键文案 | 用户不知 Esc | Phase 1 底栏或页脚 **一行小字**：「练习时按 Esc 返回课程」 |
| 完成 Dialog 是否允许点遮罩关闭 | 误触风险 | **默认否**；仅「回到课程」+ Esc |
| 音效 / 震动 | — | **NOT in scope（设计）** Phase 1 |
| Light 模式 | — | **NOT in scope（设计）**；与 PDF 深色一致优先 |

### 13.10 设计向 NOT in scope

- 营销落地页、品牌视频、插画系统。  
- 笔顺动画 / 动态水墨背景（PDF 远期）。  
- 完整读屏「逐字朗读拼音」替代视觉练习（另一类产品）。

### 13.11 设计向「已有可复用」

- `index.html` 信息结构（顶栏 / 两视图 / dialog / 隐藏 input）。  
- `styles/app.css`：间距、字号阶梯、`.done` / `.current` / `.error` 语义。  
- 交互心智：**拼音轨为主、IME 合成门禁** — Vue 复刻时禁止改为「按汉字判题」。

---

## 14. `/plan-design-review` 完成摘要

```
+====================================================================+
|         DESIGN PLAN REVIEW — COMPLETION SUMMARY                    |
+====================================================================+
| System Audit         | 无 DESIGN.md；UI 范围：课程/练习/Dialog      |
| Step 0               | 4/10 → 目标 8/10（本节已写入规格）          |
| Pass 1  (Info Arch)  | 6/10 → 9/10（ASCII 骨架 + 移动约束）        |
| Pass 2  (States)     | 3/10 → 9/10（状态表）                       |
| Pass 3  (Journey)    | 2/10 → 8/10（情绪弧表）                     |
| Pass 4  (AI Slop)    | 7/10 → 9/10（App UI 分类 + 黑名单）        |
| Pass 5  (Design Sys) | 5/10 → 8/10（Token 锚定 app.css）          |
| Pass 6  (Responsive) | 4/10 → 8/10（44px、a11y、dialog）           |
| Pass 7  (Decisions)  | 3 项建议已表列；音效/Light 明确推迟         |
+--------------------------------------------------------------------+
| NOT in scope（设计） | §13.10                                      |
| What already exists  | §13.11                                      |
| 实装后下一步         | 走 `/design-review` 做视觉 QA               |
+====================================================================+
```

**Outside design voices（Codex / 子代理）：** 本次未并行跑外部模型；若需硬规则 litmus 复检，可再开一轮。

**建议写入 `TODOS.md` 的条目（由维护人择要录入）：**

1. **a11y：** 为练习区增加 **可见**「键盘输入拼音」说明 + 验证 `dialog` 焦点循环与 Esc。  
2. **API 空/错态：** 课程列表加载与错误 UI 与 §13.4 一致，避免静默失败。  
3. **`prefers-reduced-motion`：** 接入全局媒体查询。  
4. **（可选）** 抽离 `DESIGN.md`：从 §13.6–13.7 摘出 Token 与字号表。

---

## 15. `/plan-ceo-review` 范围决策与落地记录

> 用户指令：**按设计文档开始落地**。本节等价于 CEO 模式下的 **HOLD SCOPE + 执行 Phase 1（MVS）**：不并行扩张 Phase 3（排行榜 / Socket / AI），避免一口吃掉「海」。

### 15.1 前提挑战（0A 摘要）

- **要解决的问题：** 长期自用背诗打字工具可持续维护、可测、可演进全栈。  
- **不做会怎样：** 静态 MVP 足够自用，但难以沉淀共享领域逻辑与 API 扩展。  
- **是否代理问题：** 否；直接对齐「自用 + 工程化」目标。

### 15.2 实现路径对比（0C-bis）

| 方案 | 摘要 | 取舍 |
|------|------|------|
| **A. 最小** | 仅保留静态 `index.html`，不引入构建 | 零运维；与 `technical-design` 不一致 |
| **B. MVS（已选）** | pnpm monorepo + `typing-core` + Fastify 诗词 API + Vue 练习壳 | 与设计文档 Phase 1 一致；可增量接 PG/Redis |
| **C. 理想全量** | 一期上 PG + 账号 + PWA | 自用场景运维过重；推迟到 Phase 2 |

**RECOMMENDATION：** 选 **B** —  reversibility 高（可删 `apps/*` 回退静态），且把「打字真理来源」收敛到 `typing-core`。

### 15.3 已落地交付物（代码）

- `pnpm-workspace.yaml`、`package.json` 脚本 `dev` / `test`  
- `data/poems.json`（API 数据源；与 `data/poems.js` 内容同步，后续可单一化）  
- `packages/typing-core`：`engine` / `pinyin` / `stats` + Vitest  
- `apps/api`：Fastify + CORS + `GET /api/poems`、`/api/poems/:id`  
- `apps/web`：Vue 3 + Router，课程/练习/统计/IME/完成弹窗（经 `sessionStorage` 回首页展示 dialog，避免路由卸载丢层）

### 15.4 已知风险与后续（非阻塞）

| 风险 | 缓解 |
|------|------|
| 诗词双文件 | 后续用脚本从 JSON 生成 `poems.js` 或反过来 |
| `5173` 与 `4173` localStorage 不互通 | README 已说明；自用统一入口即可 |
| API 观测性 | 现依赖 Fastify 默认日志；上线前再接指标（§8） |

---

## 16. GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | 范围与产品 | 1 | **LANDED（Phase 1）** | HOLD SCOPE；MVS 已落库，见 §15 |
| Codex Review | `/codex review` | 独立第二意见 | 0 | — | — |
| Eng Review | `/plan-eng-review` | 架构与测试 | 1 | CLEAR | 架构/测试见 §1–§10；`typing-core` 已加 Vitest |
| Design Review | `/plan-design-review` | UI/UX | 1 | CLEAR（计划态） | §13–§14；实装后建议 `/design-review` |

**UNRESOLVED：** 动效毫秒级、是否遮罩关 Dialog —— 见 §13.9。  
**VERDICT：** Phase 1 **可本地联调**；合并进主分支前建议补 **Playwright IME 烟测**（设计文档 §8）并跑一次 **实机 `/design-review`**。

---

*文档版本：2026-03-24（含 plan-design-review + plan-ceo-review 落地记录）· 栈：Vue 3 + Vite + Fastify + TypeScript + pnpm monorepo*
