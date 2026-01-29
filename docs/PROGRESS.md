# 开发进度

> 最后更新: 2026-01-29

---

## 当前状态

**Phase 3: Multi-Agent Pipeline** — ✅ 已完成

Bot 现在具备 AI 对话能力，使用 LangGraph 实现多 Agent 工作流。

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
| `src/pipeline/message-queue.ts` | FIFO 消息队列 |
| `src/pipeline/debounce-controller.ts` | Debounce 控制器，时间间隔触发 |
| `src/pipeline/message-aggregator.ts` | 多消息聚合，保留发送者信息 |

**Debounce 策略：**
- `debounceMs`：收到最后一条消息后等待时间（默认 3 秒）
- `maxWaitMs`：收到第一条消息后最长等待时间（默认 10 秒）
- 进度反馈：多条消息时发送 "正在处理..." 提示

**消息聚合：**
- 统计参与者和消息数量
- 格式化对话文本：`[昵称] 消息内容`
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
| `src/agent/state.ts` | LangGraph 状态定义 |
| `src/agent/graph.ts` | Agent 工作流图 |
| `src/agent/nodes/summary.ts` | 消息总结节点 |
| `src/agent/nodes/intent.ts` | 意图识别节点 |
| `src/agent/nodes/router.ts` | 路由节点 |
| `src/agent/nodes/chat-executor.ts` | 对话执行节点 |

**工作流程：**
```
Input → Summary → Intent → Router → Executor → Response
```

**节点说明：**
- **Summary**：多条消息时生成摘要
- **Intent**：识别意图（chat/question/command）
- **Router**：根据意图选择执行器
- **Chat Executor**：生成对话回复

### 7. OneBot 集成（QQ）

| 文件 | 功能 |
|------|------|
| `src/onebot/types.ts` | OneBot 11 协议类型定义 |
| `src/onebot/errors.ts` | 错误类型（连接错误、API 错误） |
| `src/onebot/client.ts` | HTTP API 客户端 |
| `src/onebot/webhook.ts` | Webhook 事件处理器 |
| `src/onebot/message-normalizer.ts` | 消息规范化 |

**客户端功能：**
- `getLoginInfo()` — 获取登录信息
- `sendPrivateMsg()` — 发送私聊消息
- `sendGroupMsg()` — 发送群聊消息
- `getGroupInfo()` — 获取群信息

**Webhook 处理：**
- 过滤非目标群聊消息
- 过滤 Bot 自己发送的消息
- 消息规范化为统一格式

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
│   │   ├── state.ts             # LangGraph 状态定义
│   │   ├── graph.ts             # Agent 工作流图
│   │   └── nodes/
│   │       ├── summary.ts       # 消息总结节点
│   │       ├── intent.ts        # 意图识别节点
│   │       ├── router.ts        # 路由节点
│   │       └── chat-executor.ts # 对话执行节点
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
| M3: 有记忆 | ⏳ | 待开发：上下文管理 |
| M4: 能动手 | ⏳ | 待开发：工具调用 |
| M5: 可管理 | ⏳ | 待开发：Web UI |
