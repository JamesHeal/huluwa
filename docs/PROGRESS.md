# 开发进度

> 最后更新: 2026-01-29

---

## 当前状态

**Phase 3.5: @mention 触发机制** — ✅ 已完成

Bot 现在只在被 @mention 时触发处理，支持 ignore 意图识别。

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
| `src/agent/graph.ts` | Agent 工作流图（含 ignoreHandler 节点） |
| `src/agent/nodes/summary.ts` | 消息总结节点（理解 `[→@我]` 标记） |
| `src/agent/nodes/intent.ts` | 意图识别节点（支持 ignore 意图） |
| `src/agent/nodes/router.ts` | 路由节点 |
| `src/agent/nodes/chat-executor.ts` | 对话执行节点（Bot 身份认知） |

**工作流程：**
```
Input → Summary → Intent ──→ ignore? ──→ ignoreHandler → END (不发消息)
                              │
                              └──→ Planner → Router → Executor → Response
```

**节点说明：**
- **Summary**：多条消息时生成摘要，关注 `[→@我]` 标记的消息
- **Intent**：识别意图（chat/question/command/ignore/unknown）
- **ignoreHandler**：ignore 意图时设置空响应，跳过后续处理
- **Router**：根据计划选择执行器
- **Chat Executor**：生成对话回复，Bot 知道自己是"Huluwa"

**Bot 身份认知：**
- Bot 名称：Huluwa（葫芦娃）
- `@Huluwa` = 和 Bot 说话
- 消息中 `[→@我]` 标记 = 需要回复
- 无标记消息 = 上下文参考，不逐条回复

### 7. OneBot 集成（QQ）

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
  isMentionBot: boolean;  // 新增：是否 @bot
}
```

### 5. HTTP 服务器

| 文件 | 功能 |
|------|------|
| `src/server/server.ts` | 原生 Node.js HTTP 服务器 |

**功能：**
- 路由注册
- 请求体解析
- 健康检查端点 (`/health`)

### 6. 应用整合

| 文件 | 功能 |
|------|------|
| `src/app.ts` | 应用主类，整合所有组件 |
| `src/index.ts` | 入口文件 |

**功能：**
- 启动时连接 OneBot，验证登录状态
- 注册 Webhook 路由接收消息
- 收到消息后回复 "收到: xxx"
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
│   │   └── provider.ts          # LangChain 模型工厂
│   ├── agent/
│   │   ├── index.ts
│   │   ├── state.ts             # LangGraph 状态定义（含 ignore 意图）
│   │   ├── graph.ts             # Agent 工作流图（含 ignoreHandler）
│   │   └── nodes/
│   │       ├── summary.ts       # 消息总结节点
│   │       ├── intent.ts        # 意图识别节点（支持 ignore）
│   │       ├── plan.ts          # 计划节点
│   │       ├── router.ts        # 路由节点
│   │       └── chat-executor.ts # 对话执行节点（Bot 身份认知）
│   ├── config/
│   │   ├── index.ts
│   │   ├── schema.ts            # Zod Schema
│   │   ├── loader.ts            # 配置加载器
│   │   └── env-substitution.ts  # 环境变量替换
│   ├── logger/
│   │   ├── index.ts
│   │   ├── logger.ts            # 日志核心
│   │   └── file-transport.ts    # 文件输出
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
│   │   └── server.ts            # HTTP 服务器
│   └── types/
│       └── index.ts
├── config/
│   ├── config.json5             # 实际配置（不提交）
│   └── config.example.json5     # 配置示例
├── logs/                        # 日志目录
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

---

## 依赖清单

```json
{
  "dependencies": {
    "@langchain/anthropic": "^1.3.12",
    "@langchain/core": "^1.1.17",
    "@langchain/langgraph": "^1.1.2",
    "json5": "^2.2.3",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "tsx": "^4.19.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```

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
| M3: 有记忆 | ⏳ | 待开发：上下文管理 |
| M4: 能动手 | ⏳ | 待开发：工具调用 |
| M5: 可管理 | ⏳ | 待开发：Web UI |

---

## 本次更新详情 (2026-01-29)

### @mention 触发机制

**改动背景：** 原 debounce 机制会响应所有消息，现改为只在被 @mention 时触发。

**改动文件：**

| 文件 | 改动 |
|------|------|
| `src/onebot/message-normalizer.ts` | 新增 `isMentionBot` 字段，检测 @bot 段 |
| `src/onebot/webhook.ts` | 传递 `selfId` 给 normalizer |
| `src/onebot/client.ts` | 发消息改用 segment 数组格式 |
| `src/app.ts` | `DebounceController` → `MessageQueue`；空响应不发消息 |
| `src/pipeline/message-aggregator.ts` | formattedText 标记 `[→@我]` |
| `src/agent/state.ts` | IntentType 新增 `'ignore'` |
| `src/agent/nodes/intent.ts` | prompt 支持 ignore 识别 |
| `src/agent/nodes/summary.ts` | prompt 理解标记 |
| `src/agent/nodes/chat-executor.ts` | Bot 身份认知（Huluwa） |
| `src/agent/graph.ts` | 新增 `ignoreHandler` 节点和条件路由 |

**新流程：**
```
消息到达 → 过滤 → normalize(检测@bot) → 入队
                                        ↓ (isMentionBot)
                                   flush 全部 → Agent Graph
                                                    ↓
                                        intent == ignore? → 不发消息
                                                    ↓
                                               正常回复
```

### 后续开发方向

1. **多轮对话记忆** — 保留历史上下文
2. **工具调用** — 联网搜索、代码执行
3. **更多 Executor** — question/command 专用处理器
4. **消息缓冲区管理** — 设置上限或过期时间
5. **私聊模式** — 私聊无需 @，直接触发
