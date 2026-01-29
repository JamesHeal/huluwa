# CLAUDE.md - Huluwa AI Bot 开发规范

## 项目概述

Huluwa 是一个基于 LangGraph 的 Multi-Agent iMessage AI Bot，采用 OneBot 协议集成。

### 技术栈
****
| 分类       | 技术             | 说明                  |
| ---------- | ---------------- | --------------------- |
| 运行时     | Node.js >=22.0.0 | ESM 模块系统          |
| 语言       | TypeScript 5.6   | strict 模式           |
| Agent 框架 | LangGraph        | Multi-Agent 工作流    |
| AI SDK     | LangChain        | Anthropic/OpenAI 集成 |
| 向量数据库 | LanceDB          | 知识库存储            |
| 配置验证   | Zod              | Schema 类型安全       |
| 测试       | Vitest           | 单元测试              |

### 项目结构

```
src/
├── index.ts              # 应用入口
├── app.ts                # 应用主类
├── agent/                # Multi-Agent 系统
│   ├── graph.ts          # LangGraph 工作流定义
│   ├── state.ts          # Agent 状态定义
│   └── nodes/            # Agent 执行节点
│       ├── summary.ts    # 消息总结
│       ├── intent.ts     # 意图识别
│       ├── plan.ts       # 任务规划
│       ├── router.ts     # 执行器路由
│       └── chat-executor.ts
├── ai/                   # AI 模型管理
│   ├── model-registry.ts # 模型注册表
│   └── provider.ts       # Provider 适配
├── onebot/               # OneBot 协议
│   ├── client.ts         # HTTP 客户端
│   ├── webhook.ts        # Webhook 处理
│   └── message-normalizer.ts
├── memory/               # 对话记忆
│   ├── conversation-memory.ts
│   ├── knowledge-base.ts # LanceDB
│   └── summary-service.ts
├── pipeline/             # 消息处理管道
│   ├── message-queue.ts
│   └── message-aggregator.ts
├── config/               # 配置系统
│   ├── schema.ts         # Zod Schema
│   └── loader.ts         # JSON5 加载
├── logger/               # 日志系统
└── server/               # HTTP 服务器
```

## 开发命令

```bash
# 开发
pnpm dev              # 启动开发服务器 (tsx --env-file=.env)

# 构建
pnpm build            # TypeScript 编译
pnpm start            # 启动生产服务器

# 代码质量
pnpm test             # 运行 Vitest 测试
pnpm typecheck        # TypeScript 类型检查
```

## TypeScript ESM 规范

### 模块导入

```typescript
// ESM 导入必须包含 .js 扩展名
import { something } from './module.js'
import type { SomeType } from './types.js'

// 错误：缺少扩展名
// import { something } from './module'
```

### 类型导入

```typescript
// 使用 type 关键字导入纯类型
import type { Config, Options } from './types.js'

// 混合导入
import { createServer, type ServerOptions } from './server.js'
```

### 严格模式要求

项目启用了严格的 TypeScript 检查：

```typescript
// noUncheckedIndexedAccess: true
const item = array[0] // 类型为 T | undefined
if (item !== undefined) {
  // 此处 item 类型为 T
}

// exactOptionalPropertyTypes: true
interface Config {
  name?: string  // 只能是 string 或不存在，不能是 undefined
}
```

## LangGraph 开发规范

### Agent 节点定义

```typescript
import { StateGraph } from '@langchain/langgraph'
import type { AgentState } from './state.js'

// 节点函数签名
type NodeFunction = (state: AgentState) => Promise<Partial<AgentState>>

// 定义节点
const summaryNode: NodeFunction = async (state) => {
  const { input } = state
  // 处理逻辑
  return { summary: result }
}
```

### 状态定义

```typescript
import { Annotation } from '@langchain/langgraph'

// 使用 Annotation 定义状态
export const AgentStateAnnotation = Annotation.Root({
  input: Annotation<AggregatedMessages>(),
  summary: Annotation<string | undefined>(),
  intent: Annotation<Intent | undefined>(),
  response: Annotation<string | undefined>(),
})

export type AgentState = typeof AgentStateAnnotation.State
```

### 工作流构建

```typescript
const workflow = new StateGraph(AgentStateAnnotation)
  .addNode('summary', summaryNode)
  .addNode('intent', intentNode)
  .addEdge(START, 'summary')
  .addEdge('summary', 'intent')
  .addConditionalEdges('intent', routerFunction)
  .addEdge('executor', END)

export const graph = workflow.compile()
```

## AI 模型管理

### 模型注册

```json5
// config.json5
{
  ai: {
    default: 'claude',
    providers: {
      claude: {
        provider: 'anthropic',
        model: 'claude-sonnet-4-20250514',
        apiKey: '${ANTHROPIC_API_KEY}',
        temperature: 0.7,
        maxTokens: 4096
      },
      glm: {
        provider: 'zhipu',
        model: 'glm-4-flash',
        apiKey: '${ZHIPU_API_KEY}'
      }
    }
  }
}
```

### 模型使用

```typescript
import { getModel } from '../ai/index.js'

// 获取默认模型
const model = getModel()

// 获取指定模型
const fastModel = getModel('glm')

// 调用模型
const response = await model.invoke([
  { role: 'system', content: systemPrompt },
  { role: 'user', content: userMessage }
])
```

## 配置系统

### Zod Schema 定义

```typescript
import { z } from 'zod'

export const configSchema = z.object({
  target: z.object({
    type: z.enum(['group', 'private']),
    id: z.number()
  }),
  onebot: z.object({
    httpUrl: z.string().url(),
    webhookPath: z.string()
  }),
  // ...
})

export type Config = z.infer<typeof configSchema>
```

### 环境变量替换

配置文件支持 `${VAR_NAME}` 语法：

```json5
{
  ai: {
    providers: {
      claude: {
        apiKey: '${ANTHROPIC_API_KEY}'  // 自动替换为环境变量
      }
    }
  }
}
```

## 消息处理管道

### 消息队列

```typescript
// 所有消息进入队列
messageQueue.push(normalizedMessage)

// @mention 触发时 flush
if (message.isMentionBot) {
  const history = messageQueue.flush()
  const aggregated = messageAggregator.aggregate(history)
  await agent.invoke({ input: aggregated })
}
```

### 消息聚合

```typescript
interface AggregatedMessages {
  messages: Array<{
    senderId: string
    senderName: string
    text: string
    attachments: Attachment[]
    timestamp: number
  }>
  totalCount: number
  timeRange: { start: number; end: number }
}
```

## 测试规范

### Vitest 测试

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { MessageQueue } from './message-queue.js'

describe('MessageQueue', () => {
  let queue: MessageQueue

  beforeEach(() => {
    queue = new MessageQueue()
  })

  it('should push and flush messages', () => {
    queue.push(message1)
    queue.push(message2)

    const result = queue.flush()

    expect(result).toHaveLength(2)
    expect(queue.size).toBe(0)
  })
})
```

### 运行测试

```bash
pnpm test              # 运行所有测试
pnpm test message      # 运行匹配 "message" 的测试
pnpm test --watch      # 监听模式
```

## 日志规范

### 日志使用

```typescript
import { logger } from '../logger/index.js'

// 不同级别
logger.debug('Processing message', { messageId })
logger.info('Agent started')
logger.warn('Rate limit approaching')
logger.error('Failed to call API', { error })
```

### 日志配置

```json5
{
  logging: {
    level: 'info',           // debug | info | warn | error
    file: {
      enabled: true,
      directory: './logs'
    },
    consoleFormat: 'pretty'  // pretty | json
  }
}
```

## 代码规范

### 文件命名

```
kebab-case 命名：
message-queue.ts
conversation-memory.ts
chat-executor.ts
```

### 异步处理

```typescript
// 使用 async/await
export async function processMessage(message: Message): Promise<Response> {
  try {
    const result = await model.invoke(message)
    return { success: true, data: result }
  } catch (error) {
    logger.error('Process failed', { error })
    throw error
  }
}
```

### 错误处理

```typescript
// 定义业务错误
export class OneBotError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode?: number
  ) {
    super(message)
    this.name = 'OneBotError'
  }
}

// 使用
throw new OneBotError('Connection failed', 'CONNECTION_ERROR', 500)
```

### 类型安全

```typescript
// 使用 unknown 而非 any
function parseJson(input: string): unknown {
  return JSON.parse(input)
}

// 使用类型守卫
function isMessage(value: unknown): value is Message {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    'content' in value
  )
}
```

## Git 规范

### Commit 格式

```
<type>(<scope>): <subject>

需求: <需求描述>
改动:
  - <改动点1>
  - <改动点2>
```

### Type 类型

| Type     | 描述      |
| -------- | --------- |
| feat     | 新功能    |
| fix      | Bug 修复  |
| refactor | 重构      |
| test     | 测试      |
| docs     | 文档      |
| chore    | 构建/工具 |

### Scope 识别

| 路径           | Scope    |
| -------------- | -------- |
| src/agent/*    | agent    |
| src/ai/*       | ai       |
| src/onebot/*   | onebot   |
| src/memory/*   | memory   |
| src/pipeline/* | pipeline |
| src/config/*   | config   |

### 示例

```
feat(agent): 添加意图识别节点

需求: 根据用户消息识别意图类型（chat/question/command/ignore）
改动:
  - 添加 intent.ts 节点
  - 定义 Intent 类型
  - 更新 graph.ts 工作流
```

## 分支管理

```
main            # 生产分支
├── feat/*      # 功能开发
├── fix/*       # Bug 修复
└── refactor/*  # 重构
```

### 开发流程

```
feature 分支
    ↓ 开发完成
本地测试 (pnpm test && pnpm typecheck)
    ↓ 通过
合并到 main
```

## 安全规范

### 环境变量

```bash
# .env (不提交到 git)
ANTHROPIC_API_KEY=sk-xxx
OPENAI_API_KEY=sk-xxx
ZHIPU_API_KEY=xxx
```

### API Key 保护

- 使用环境变量存储敏感信息
- 配置文件使用 `${VAR_NAME}` 引用
- 日志中不打印敏感信息

## 性能优化

### 模型选择策略

| 任务类型 | 推荐模型      | 原因                 |
| -------- | ------------- | -------------------- |
| 消息总结 | glm (快速)    | 轻量任务，速度优先   |
| 意图识别 | 默认 (claude) | 决策关键，准确性优先 |
| 对话生成 | 默认 (claude) | 核心功能，质量优先   |

### 记忆管理

- Hot Context: 最近 7 天消息快速访问
- Summarized: 长对话自动摘要
- Knowledge Base: 超期消息向量化存储

## 调试技巧

### 日志调试

```bash
# 开发时使用 debug 级别
LOG_LEVEL=debug pnpm dev
```

### Agent 调试

```typescript
// 打印 Agent 状态
logger.debug('Agent state', {
  summary: state.summary,
  intent: state.intent,
  plan: state.plan
})
```

---

Built with Claude Code
