# 开发进度

> 最后更新: 2026-01-29

---

## 当前状态

**Phase 6: Web UI 监控界面** — ✅ 已完成

Bot 已具备 Web UI 监控界面，支持实时状态仪表盘和日志查看。

---

## 已完成内容

### 1. 项目初始化

| 项目 | 状态 | 说明 |
|------|------|------|
| package.json | ✅ | ESM 模块、Node.js ≥22 |
| tsconfig.json | ✅ | 严格模式、NodeNext 模块 |
| .gitignore | ✅ | 忽略 node_modules、dist、logs、.env |
| vitest.config.ts | ✅ | 测试框架配置 |
| 目录结构 | ✅ | src/、config/、logs/ |

**技术栈：**
- 运行时：Node.js ≥22
- 语言：TypeScript (strict)
- 模块：ESM (NodeNext)
- 包管理：pnpm

### 2. 配置系统

| 文件 | 功能 |
|------|------|
| `src/config/schema.ts` | Zod Schema 定义，类型安全的配置验证 |
| `src/config/loader.ts` | JSON5 配置加载器 |
| `src/config/env-substitution.ts` | 环境变量替换 (`${VAR_NAME}`) |
| `config/config.example.json5` | 配置示例文件 |

**配置结构：**
```json5
{
  target: { type: "group", id: 123456789 },
  onebot: { httpUrl: "http://localhost:3000", webhookPath: "/onebot" },
  server: { port: 3001, host: "0.0.0.0" },
  logging: { level: "info", file: { enabled: true }, consoleFormat: "pretty" }
}
```

### 3. 日志系统

| 文件 | 功能 |
|------|------|
| `src/logger/logger.ts` | 日志核心，支持 debug/info/warn/error 级别 |
| `src/logger/file-transport.ts` | 文件输出，按日期生成日志文件 |

**特性：**
- 控制台格式：pretty（彩色）/ json
- 文件输出：JSON 格式，便于分析
- 子 Logger：支持 `logger.child('context')` 创建带上下文的日志器

### 4. 消息处理 Pipeline

| 文件 | 功能 |
|------|------|
| `src/pipeline/message-queue.ts` | FIFO 消息队列（历史缓冲区） |
| `src/pipeline/debounce-controller.ts` | Debounce 控制器（已弃用，保留代码） |
| `src/pipeline/message-aggregator.ts` | 多消息聚合，保留发送者信息 |

**@mention 触发机制（当前）：**
```
消息到达 → 过滤 → normalize(检测@bot) → 入队缓冲
                                         ↓ (如果 isMentionBot)
                                    flush 全部历史 → 聚合 → Agent
```
- 所有消息存入 `MessageQueue` 作为历史缓冲
- 只有 `@bot` 消息触发处理
- 触发时 flush 全部缓冲消息，一起发给 AI 作为上下文
- 进度反馈：多条消息时发送"收到，让我看下..."

**消息聚合：**
- 统计参与者和消息数量
- 格式化对话文本：`[昵称] [→@我] 消息内容`（@bot 消息带标记）
- 保留时间范围信息

### 5. AI Provider 抽象

| 文件 | 功能 |
|------|------|
| `src/ai/types.ts` | AI 类型定义 |
| `src/ai/provider.ts` | LangChain 模型工厂 |

**支持的 Provider：**
- Anthropic (Claude) ✅
- OpenAI (待实现)

### 6. Multi-Agent Pipeline

| 文件 | 功能 |
|------|------|
| `src/agent/state.ts` | LangGraph 状态定义（IntentType 含 ignore） |
| `src/agent/graph.ts` | Agent 工作流图（含 ignoreHandler 和 toolExecutor 节点） |
| `src/agent/nodes/summary.ts` | 消息总结节点（理解 `[→@我]` 标记） |
| `src/agent/nodes/intent.ts` | 意图识别节点（支持 ignore 意图） |
| `src/agent/nodes/plan.ts` | 任务规划节点（含 toolHints） |
| `src/agent/nodes/router.ts` | 路由节点（chat/tool） |
| `src/agent/nodes/chat-executor.ts` | 对话执行节点（Bot 身份认知） |
| `src/agent/nodes/tool-executor.ts` | 工具执行节点（ReAct 循环） |

**工作流程：**
```
Input → Summary → Intent ──→ ignore? ──→ ignoreHandler → END (不发消息)
                              │
                              └──→ Planner → Router ──→ chat ──→ chatExecutor → END
                                              │
                                              └──→ tool ──→ toolExecutor → END
```

**节点说明：**
- **Summary**：多条消息时生成摘要，关注 `[→@我]` 标记的消息
- **Intent**：识别意图（chat/question/command/ignore/unknown）
- **ignoreHandler**：ignore 意图时设置空响应，跳过后续处理
- **Planner**：生成执行计划，包含 toolHints 工具提示
- **Router**：根据计划选择执行器（chat 或 tool）
- **Chat Executor**：生成对话回复，Bot 知道自己是"Huluwa"
- **Tool Executor**：ReAct 循环执行工具调用

**Bot 身份认知：**
- Bot 名称：Huluwa（葫芦娃）
- `@Huluwa` = 和 Bot 说话
- 消息中 `[→@我]` 标记 = 需要回复
- 无标记消息 = 上下文参考，不逐条回复

### 7. 对话记忆系统 (M3)

| 文件 | 功能 |
|------|------|
| `src/memory/types.ts` | 记忆类型定义（ConversationTurn, Conversation 等） |
| `src/memory/conversation-memory.ts` | 对话记忆管理器（三层上下文架构） |
| `src/memory/summary-service.ts` | 自动摘要生成服务 |
| `src/memory/knowledge-base.ts` | LanceDB 向量知识库 |
| `src/memory/embedding-service.ts` | Embedding 服务（OpenAI/智谱） |

**三层上下文架构：**
```
┌─────────────────────────────────────────────────────┐
│ Layer 1: Sliding Window（最近 N 轮完整对话）        │
│   - maxTurns: 20（默认）                            │
│   - maxTokens: 8000（默认）                         │
│   - 直接注入 AI 上下文                              │
├─────────────────────────────────────────────────────┤
│ Layer 2: Periodic Summary（7天内历史摘要）          │
│   - 每 10 轮自动生成摘要                            │
│   - 最多保留 20 条摘要                              │
│   - 压缩历史信息                                    │
├─────────────────────────────────────────────────────┤
│ Layer 3: Knowledge Base（超过7天的向量检索）        │
│   - LanceDB 本地向量数据库                          │
│   - 自动归档超期对话                                │
│   - 支持语义检索                                    │
└─────────────────────────────────────────────────────┘
```

**特性：**
- 持久化：会话自动保存到磁盘（JSON 格式）
- TTL：会话自动过期（默认 60 分钟）
- Token 估算：针对中英混合文本的准确估算
- Embedding：支持 OpenAI 和智谱 embedding provider

### 8. 工具系统 (M4)

| 文件 | 功能 |
|------|------|
| `src/tools/types.ts` | 工具类型定义（ToolDefinition, ToolExecutionResult） |
| `src/tools/registry.ts` | 工具注册表（注册、检索、转换） |
| `src/tools/cache.ts` | 工具缓存（LRU 缓存，支持 TTL） |
| `src/tools/builtin/datetime.ts` | 日期时间工具 |
| `src/tools/builtin/url-fetch.ts` | URL 内容获取工具 |
| `src/tools/builtin/web-search.ts` | Web 搜索工具（Tavily API） |

**工具执行流程（ReAct）：**
```
用户请求 → Plan（生成 toolHints）→ Router → Tool Executor
                                              ↓
                                    绑定工具到模型
                                              ↓
                        ┌────────── ReAct 循环 ──────────┐
                        │                                │
                        │  模型调用 → 工具调用？→ 是 → 执行工具 ─┐
                        │                  │                    │
                        │                  否                   │
                        │                  ↓                    │
                        │             生成最终回复 ←────────────┘
                        │                                │
                        └─────── 最多 5 次迭代 ──────────┘
```

**工具特性：**
- 注册表模式：统一管理，动态绑定
- 缓存支持：可配置 TTL 的 LRU 缓存
- 超时控制：默认 30 秒，可按工具配置
- Metrics 记录：执行时间、成功率、缓存命中率

**内置工具：**
| 工具 | 描述 | 缓存 |
|------|------|------|
| `datetime` | 获取当前日期时间（任意时区） | ✓ 60s |
| `url_fetch` | 获取 URL 内容（支持 JSON/Text） | ✓ 300s |
| `web_search` | Web 搜索（需配置 Tavily API Key） | ✓ 300s |

### 9. OneBot 集成（QQ）

| 文件 | 功能 |
|------|------|
| `src/onebot/types.ts` | OneBot 11 协议类型定义 |
| `src/onebot/errors.ts` | 错误类型（连接错误、API 错误） |
| `src/onebot/client.ts` | HTTP API 客户端（segment 数组格式发送） |
| `src/onebot/webhook.ts` | Webhook 事件处理器（传递 selfId） |
| `src/onebot/message-normalizer.ts` | 消息规范化（@bot 检测） |

**客户端功能：**
- `getLoginInfo()` — 获取登录信息
- `sendPrivateMsg()` — 发送私聊消息（segment 格式，避免 CQ 码解析问题）
- `sendGroupMsg()` — 发送群聊消息（segment 格式）
- `getGroupInfo()` — 获取群信息
- `downloadAttachments()` — 下载附件到 base64

**Webhook 处理：**
- 过滤非目标群聊消息
- 过滤 Bot 自己发送的消息
- 消息规范化为统一格式
- 检测 `{type: 'at', data: {qq: selfId}}` 设置 `isMentionBot` 标志

**NormalizedMessage 结构：**
```typescript
interface NormalizedMessage {
  messageId: number;
  messageType: 'private' | 'group';
  text: string;
  userId: number;
  groupId: number | undefined;
  nickname: string;
  timestamp: Date;
  isGroup: boolean;
  attachments: Attachment[];
  isMentionBot: boolean;  // 是否 @bot
}
```

### 10. HTTP 服务器

| 文件 | 功能 |
|------|------|
| `src/server/server.ts` | 原生 Node.js HTTP 服务器 |

**功能：**
- 路由注册
- 请求体解析
- 健康检查端点 (`/health`)

### 11. 应用整合

| 文件 | 功能 |
|------|------|
| `src/app.ts` | 应用主类，整合所有组件 |
| `src/index.ts` | 入口文件 |

**功能：**
- 启动时连接 OneBot，验证登录状态
- 初始化知识库（如果启用）
- 注册内置工具
- 注册 Webhook 路由接收消息
- 优雅退出（SIGINT/SIGTERM）

---

## 项目结构

```
huluwa/
├── src/
│   ├── index.ts                 # 入口文件
│   ├── app.ts                   # 应用主类
│   ├── ai/
│   │   ├── index.ts
│   │   ├── types.ts             # AI 类型定义
│   │   ├── model-registry.ts    # 模型注册表
│   │   └── provider.ts          # LangChain 模型工厂
│   ├── agent/
│   │   ├── index.ts
│   │   ├── state.ts             # LangGraph 状态定义
│   │   ├── graph.ts             # Agent 工作流图
│   │   └── nodes/
│   │       ├── summary.ts       # 消息总结节点
│   │       ├── intent.ts        # 意图识别节点
│   │       ├── plan.ts          # 计划节点
│   │       ├── router.ts        # 路由节点
│   │       ├── chat-executor.ts # 对话执行节点
│   │       └── tool-executor.ts # 工具执行节点（ReAct）
│   ├── config/
│   │   ├── index.ts
│   │   ├── schema.ts            # Zod Schema（含 Memory/Tools 配置）
│   │   ├── loader.ts            # 配置加载器
│   │   └── env-substitution.ts  # 环境变量替换
│   ├── logger/
│   │   ├── index.ts
│   │   ├── logger.ts            # 日志核心
│   │   └── file-transport.ts    # 文件输出
│   ├── memory/                  # 对话记忆系统
│   │   ├── index.ts
│   │   ├── types.ts             # 记忆类型定义
│   │   ├── conversation-memory.ts # 对话记忆管理器
│   │   ├── summary-service.ts   # 摘要服务
│   │   ├── knowledge-base.ts    # LanceDB 知识库
│   │   └── embedding-service.ts # Embedding 服务
│   ├── metrics/                 # 监控指标
│   │   └── index.ts
│   ├── onebot/
│   │   ├── index.ts
│   │   ├── client.ts            # OneBot HTTP 客户端
│   │   ├── webhook.ts           # Webhook 处理器
│   │   ├── message-normalizer.ts
│   │   ├── types.ts
│   │   └── errors.ts
│   ├── pipeline/
│   │   ├── index.ts
│   │   ├── message-queue.ts     # 消息队列
│   │   ├── debounce-controller.ts # Debounce 控制器
│   │   └── message-aggregator.ts  # 消息聚合器
│   ├── server/
│   │   ├── index.ts
│   │   └── server.ts            # HTTP 服务器（增强路由、WebSocket）
│   ├── web/                     # Web UI 模块
│   │   ├── index.ts             # 模块入口
│   │   ├── router.ts            # API 路由器
│   │   ├── api/
│   │   │   ├── status.ts        # 状态 API
│   │   │   ├── metrics.ts       # 指标 API
│   │   │   ├── logs.ts          # 日志 API
│   │   │   └── config.ts        # 配置 API
│   │   ├── ws/
│   │   │   ├── server.ts        # WebSocket 服务器
│   │   │   └── types.ts         # 消息类型
│   │   └── services/
│   │       └── log-reader.ts    # 日志读取服务
│   ├── tools/                   # 工具系统
│   │   ├── index.ts
│   │   ├── types.ts             # 工具类型定义
│   │   ├── registry.ts          # 工具注册表
│   │   ├── cache.ts             # 工具缓存（LRU）
│   │   └── builtin/             # 内置工具
│   │       ├── index.ts
│   │       ├── datetime.ts
│   │       ├── url-fetch.ts
│   │       └── web-search.ts
│   └── types/
│       └── index.ts
├── config/
│   ├── config.json5             # 实际配置（不提交）
│   └── config.example.json5     # 配置示例
├── data/                        # 数据目录
│   ├── memory/                  # 记忆持久化
│   └── knowledge/               # 知识库数据
├── logs/                        # 日志目录
├── web/                         # 前端项目
│   ├── src/
│   │   ├── api/                 # API 客户端
│   │   ├── components/          # React 组件
│   │   ├── pages/               # 页面组件
│   │   ├── stores/              # Zustand 状态
│   │   ├── hooks/               # React Hooks
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── package.json
│   ├── vite.config.ts
│   └── tailwind.config.js
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

---

## 依赖清单

```json
{
  "dependencies": {
    "@lancedb/lancedb": "^0.23.0",
    "@langchain/anthropic": "^1.3.12",
    "@langchain/core": "^1.1.17",
    "@langchain/langgraph": "^1.1.2",
    "@langchain/openai": "^1.2.3",
    "json5": "^2.2.3",
    "ws": "^8.x",
    "zod": "^3.25.32"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "@types/ws": "^8.x",
    "tsx": "^4.19.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```

**前端依赖：**
```json
{
  "dependencies": {
    "react": "^18.x",
    "react-dom": "^18.x",
    "react-router-dom": "^6.x",
    "zustand": "^5.x",
    "recharts": "^2.x",
    "lucide-react": "^0.x"
  },
  "devDependencies": {
    "vite": "^6.x",
    "@vitejs/plugin-react": "^4.x",
    "tailwindcss": "^3.x",
    "typescript": "^5.x"
  }
}
```

**新增依赖说明：**
- `@lancedb/lancedb` - 本地向量数据库，用于知识库存储
- `@langchain/openai` - OpenAI 模型支持，用于 embedding 和工具调用
- `ws` - WebSocket 服务器，用于 Web UI 实时通信
- `react`, `vite`, `tailwindcss` - 前端技术栈

---

## 运行环境

### 本地开发

```bash
# 安装依赖
pnpm install

# 开发模式运行
pnpm dev

# 构建
pnpm build

# 生产模式运行
pnpm start
```

### 外部依赖

- **NapCatQQ** — QQ 协议端，提供 OneBot 11 API
  - HTTP 服务端口：3000
  - HTTP 客户端上报地址：http://localhost:3001/onebot

---

## 平台变更说明

原计划使用 **iMessage + BlueBubbles**，实际开发中切换为 **QQ + NapCatQQ**。

| 原方案 | 现方案 |
|--------|--------|
| iMessage | QQ |
| BlueBubbles Server | NapCatQQ |
| BlueBubbles REST API | OneBot 11 HTTP API |
| BlueBubbles Webhook | OneBot HTTP POST 上报 |

切换原因：用户需求变更，QQ 在国内更通用。

---

## 验证方式

1. **构建验证**
   ```bash
   pnpm build
   ```

2. **启动验证**
   ```bash
   pnpm dev
   # 观察日志：OneBot connected, Server listening
   ```

3. **功能验证**
   - 在目标 QQ 群发送消息
   - Bot 自动回复 "收到: xxx"

---

## 里程碑

| 里程碑 | 状态 | 说明 |
|--------|------|------|
| M1: 能说话 | ✅ | Bot 能在 QQ 群中收发消息 |
| M1.5: 会等待 | ✅ | 消息 Debounce、聚合 |
| M2: 会思考 | ✅ | LangGraph 多 Agent 对话 Pipeline |
| M2.5: 懂礼貌 | ✅ | @mention 触发、ignore 意图、Bot 身份认知 |
| M3: 有记忆 | ✅ | 三层上下文架构、摘要生成、LanceDB 知识库 |
| M4: 能动手 | ✅ | 工具注册表、ReAct 执行、内置工具（datetime/url_fetch/web_search） |
| M5: 可管理 | ✅ | Web UI 监控界面、实时日志、状态仪表盘 |

---

## 本次更新详情 (2026-01-29)

### 对话记忆系统 (M3)

**改动背景：** 实现三层上下文架构，让 Bot 具备长期记忆能力。

**新增文件：**

| 文件 | 功能 |
|------|------|
| `src/memory/types.ts` | 记忆类型定义 |
| `src/memory/conversation-memory.ts` | 对话记忆管理器 |
| `src/memory/summary-service.ts` | 自动摘要生成 |
| `src/memory/knowledge-base.ts` | LanceDB 向量知识库 |
| `src/memory/embedding-service.ts` | Embedding 服务 |
| `src/config/schema.ts` | 新增 MemorySchema 配置 |

**配置项：**
```json5
{
  memory: {
    enabled: true,
    maxTurns: 20,           // 滑动窗口大小
    maxTokens: 8000,        // 最大 token 数
    ttlMinutes: 60,         // 会话过期时间
    persistence: {
      enabled: true,
      directory: "./data/memory"
    },
    summarization: {
      enabled: true,
      triggerTurns: 10      // 每 N 轮生成摘要
    },
    knowledgeBase: {
      enabled: true,
      directory: "./data/knowledge",
      archiveAfterDays: 7,  // 超过 N 天归档
      embeddingProvider: "openai"
    }
  }
}
```

### 工具系统 (M4)

**改动背景：** 实现 ReAct 工具调用机制，让 Bot 具备主动获取信息的能力。

**新增文件：**

| 文件 | 功能 |
|------|------|
| `src/tools/types.ts` | 工具类型定义 |
| `src/tools/registry.ts` | 工具注册表 |
| `src/tools/cache.ts` | LRU 缓存 |
| `src/tools/builtin/datetime.ts` | 日期时间工具 |
| `src/tools/builtin/url-fetch.ts` | URL 获取工具 |
| `src/tools/builtin/web-search.ts` | Web 搜索工具 |
| `src/agent/nodes/tool-executor.ts` | ReAct 执行节点 |
| `src/config/schema.ts` | 新增 ToolsSchema 配置 |

**配置项：**
```json5
{
  tools: {
    cache: {
      enabled: true,
      maxSize: 100
    },
    defaultTimeoutMs: 30000,
    webSearch: {
      enabled: true,
      provider: "tavily",
      apiKey: "${TAVILY_API_KEY}"
    }
  }
}
```

### Web UI 监控界面 (M5)

**改动背景：** 实现 Web UI 监控界面，方便查看 Bot 运行状态和日志。

**新增文件：**

| 文件 | 功能 |
|------|------|
| `src/web/index.ts` | Web UI 模块入口 |
| `src/web/router.ts` | API 路由器 |
| `src/web/api/status.ts` | 状态 API |
| `src/web/api/metrics.ts` | 指标 API |
| `src/web/api/logs.ts` | 日志 API |
| `src/web/api/config.ts` | 配置 API（脱敏） |
| `src/web/ws/server.ts` | WebSocket 服务器 |
| `src/web/ws/types.ts` | WebSocket 消息类型 |
| `src/web/services/log-reader.ts` | 日志文件读取服务 |
| `src/server/server.ts` | 增强路由、静态文件、WebSocket 升级 |
| `src/logger/logger.ts` | 添加 EventEmitter 支持实时日志流 |
| `src/config/schema.ts` | 新增 WebUISchema 配置 |
| `web/` | 前端项目（Vite + React + Tailwind） |

**架构设计：**
```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Frontend (SPA) │◄───►│  Backend API    │◄───►│  Core Services  │
│  Vite + React   │     │  REST + WS      │     │  (Existing)     │
└─────────────────┘     └─────────────────┘     └─────────────────┘
        │                       │
        └───── WebSocket ───────┘
```

**API 端点：**
| Method | Endpoint | 描述 |
|--------|----------|------|
| GET | `/api/v1/status` | Bot 状态、连接信息 |
| GET | `/api/v1/metrics` | 工具执行统计 |
| GET | `/api/v1/logs` | 日志查询（支持过滤） |
| GET | `/api/v1/config` | 配置信息（脱敏） |

**WebSocket 事件：**
| 事件 | 方向 | 描述 |
|------|------|------|
| `log` | S→C | 新日志条目 |
| `metrics` | S→C | 指标更新（每 5 秒） |
| `connection` | S→C | 连接状态 |

**前端页面：**
- **Dashboard** — 状态卡片、指标概览、工具统计
- **Logs** — 实时日志流、级别过滤、搜索

**配置项：**
```json5
{
  webui: {
    enabled: true,        // 是否启用
    basePath: "/ui",      // Web UI 路径
    apiPath: "/api/v1",   // API 路径
    wsPath: "/ws"         // WebSocket 路径
  }
}
```

**访问方式：**
- Web UI: `http://localhost:3001/ui`
- API: `http://localhost:3001/api/v1/status`
- WebSocket: `ws://localhost:3001/ws`

### 后续开发方向

1. **更多工具** — Shell、FileSystem、Browser 等沙盒能力
2. **私聊模式** — 私聊无需 @，直接触发
3. **更多 Executor** — question/command 专用处理器
4. **消息缓冲区管理** — 设置上限或过期时间
5. **Web UI 扩展** — Messages 页面、Agent 执行可视化、认证功能
