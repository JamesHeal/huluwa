# Huluwa

基于 LangGraph 的 Multi-Agent AI Bot，通过 OneBot 协议集成消息平台。

## 特性

- **Multi-Agent 架构** - 基于 LangGraph 构建可扩展的 Agent 工作流
- **多模型支持** - Anthropic Claude、OpenAI、智谱 GLM、MiniMax、Google Gemini
- **对话记忆** - 支持会话持久化、自动摘要、LanceDB 向量检索
- **内置工具** - 日期时间、URL 抓取、Web 搜索 (Tavily)
- **OneBot 协议** - 支持群聊和私聊，兼容主流 OneBot 实现
- **Web UI 监控** - 实时查看日志、指标和配置

## 技术栈

| 分类 | 技术 | 说明 |
|------|------|------|
| 运行时 | Node.js ≥22.0.0 | ESM 模块系统 |
| 语言 | TypeScript 5.6 | strict 模式 |
| Agent 框架 | LangGraph | Multi-Agent 工作流 |
| AI SDK | LangChain | 多模型适配 |
| 向量数据库 | LanceDB | 知识库存储 |
| 配置验证 | Zod | Schema 类型安全 |
| 测试 | Vitest | 单元测试 |

## 快速开始

### 环境要求

- Node.js 22.0.0+
- pnpm

### 安装

```bash
git clone https://github.com/your-username/huluwa.git
cd huluwa
pnpm install
```

### 配置

1. 复制配置模板：

```bash
cp config.example.json5 config.json5
```

2. 创建环境变量文件：

```bash
cp .env.example .env
```

3. 编辑 `.env` 添加 API 密钥：

```bash
ANTHROPIC_API_KEY=sk-xxx
OPENAI_API_KEY=sk-xxx
ZHIPU_API_KEY=xxx
```

4. 编辑 `config.json5` 配置机器人：

```json5
{
  // 目标会话（群聊或私聊）
  target: {
    type: 'group',  // 'group' | 'private'
    id: 123456789
  },
  // OneBot 服务配置
  onebot: {
    httpUrl: 'http://localhost:5700',
    webhookPath: '/onebot'
  },
  // AI 模型配置
  ai: {
    default: 'claude',
    providers: {
      claude: {
        provider: 'anthropic',
        model: 'claude-sonnet-4-20250514',
        apiKey: '${ANTHROPIC_API_KEY}'
      }
    }
  }
}
```

### 运行

```bash
# 开发模式
pnpm dev

# 生产模式
pnpm build
pnpm start
```

## Agent 工作流

```
输入消息 → Summarizer → IntentRecognizer → Planner → Router
                                                       ↓
                                              ChatExecutor / ToolExecutor
                                                       ↓
                                                    输出回复
```

### 节点说明

| 节点 | 功能 | 模型策略 |
|------|------|----------|
| Summarizer | 消息摘要 | 快速模型 (GLM) |
| IntentRecognizer | 意图识别 | 主模型 (Claude) |
| Planner | 任务规划 | 主模型 |
| Router | 执行器路由 | 规则判断 |
| ChatExecutor | 对话生成 | 主模型 |
| ToolExecutor | 工具调用 | 主模型 |

### 意图类型

- `chat` - 普通对话
- `question` - 问题查询
- `command` - 命令执行
- `ignore` - 忽略（不回复）

## 项目结构

```
src/
├── index.ts              # 应用入口
├── app.ts                # 应用主类
├── agent/                # Multi-Agent 系统
│   ├── graph.ts          # LangGraph 工作流
│   ├── state.ts          # Agent 状态定义
│   └── nodes/            # Agent 节点
├── ai/                   # AI 模型管理
│   ├── model-registry.ts # 模型注册表
│   └── provider.ts       # Provider 适配
├── onebot/               # OneBot 协议
│   ├── client.ts         # HTTP 客户端
│   └── webhook.ts        # Webhook 处理
├── memory/               # 对话记忆
│   ├── conversation-memory.ts
│   ├── knowledge-base.ts # LanceDB 向量库
│   └── summary-service.ts
├── pipeline/             # 消息处理管道
│   ├── message-queue.ts
│   └── message-aggregator.ts
├── tools/                # 工具系统
│   ├── registry.ts       # 工具注册表
│   └── builtin/          # 内置工具
├── config/               # 配置系统
│   └── schema.ts         # Zod Schema
├── web/                  # Web UI
└── logger/               # 日志系统
```

## 配置详解

### OneBot 配置

Huluwa 通过 OneBot 协议与消息平台通信，需要配合 OneBot 实现端使用（如 go-cqhttp、Lagrange 等）。

```json5
{
  // 目标会话 - 机器人监听的群聊或私聊
  target: {
    type: 'group',      // 'group' (群聊) | 'private' (私聊)
    id: 123456789       // 群号或用户 QQ 号
  },
  // OneBot 服务配置
  onebot: {
    httpUrl: 'http://localhost:5700',  // OneBot HTTP API 地址
    accessToken: 'your-token',         // 可选：访问令牌
    webhookPath: '/onebot'             // Webhook 回调路径
  },
  // HTTP 服务器配置
  server: {
    port: 3000,         // 监听端口
    host: '0.0.0.0'     // 监听地址
  }
}
```

#### 配置说明

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `target.type` | `'group'` \| `'private'` | 是 | 目标会话类型 |
| `target.id` | `number` | 是 | 群号或 QQ 号 |
| `onebot.httpUrl` | `string` | 是 | OneBot HTTP API 地址 |
| `onebot.accessToken` | `string` | 否 | 访问令牌（与 OneBot 端配置一致） |
| `onebot.webhookPath` | `string` | 否 | Webhook 路径，默认 `/onebot` |
| `server.port` | `number` | 否 | HTTP 服务端口，默认 `3000` |
| `server.host` | `string` | 否 | 监听地址，默认 `0.0.0.0` |

#### 与 OneBot 实现端对接

1. **配置 OneBot 端的 HTTP API**：启用 HTTP API，记录端口（如 5700）
2. **配置 OneBot 端的 HTTP POST 上报**：将上报地址设为 `http://<huluwa-host>:<port>/onebot`
3. **配置 Huluwa**：将 `onebot.httpUrl` 设为 OneBot 端的 HTTP API 地址

示例（go-cqhttp config.yml）：

```yaml
servers:
  - http:
      host: 0.0.0.0
      port: 5700
      post:
        - url: http://127.0.0.1:3000/onebot
          secret: ''
```

### AI 模型

```json5
{
  ai: {
    default: 'claude',  // 默认模型
    providers: {
      claude: {
        provider: 'anthropic',
        model: 'claude-sonnet-4-20250514',
        apiKey: '${ANTHROPIC_API_KEY}',
        temperature: 0.7,
        maxTokens: 4096
      },
      glm: {
        provider: 'glm',
        model: 'glm-4-flash',
        apiKey: '${ZHIPU_API_KEY}'
      }
    }
  }
}
```

支持的 Provider：`anthropic`, `openai`, `glm`, `minimax`, `gemini`

### 记忆系统

```json5
{
  memory: {
    enabled: true,
    maxTurns: 20,           // 保留最近对话轮数
    maxTokens: 8000,        // Token 上限
    ttlMinutes: 60,         // 会话超时
    persistence: {
      enabled: true,
      directory: './data/memory'
    },
    summarization: {
      enabled: true,
      triggerTurns: 10      // 触发摘要的轮数
    },
    knowledgeBase: {
      enabled: false,
      directory: './data/knowledge',
      embeddingProvider: 'openai'
    }
  }
}
```

### 工具配置

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
      provider: 'tavily',
      apiKey: '${TAVILY_API_KEY}'
    }
  }
}
```

### Web UI

```json5
{
  webui: {
    enabled: true,
    basePath: '/ui',
    apiPath: '/api/v1',
    wsPath: '/ws'
  }
}
```

## 开发

### 命令

```bash
pnpm dev        # 启动开发服务器
pnpm build      # TypeScript 编译
pnpm test       # 运行测试
pnpm typecheck  # 类型检查
```

### 测试

```bash
# 运行所有测试
pnpm test

# 运行特定测试
pnpm test message

# 监听模式
pnpm test --watch
```

## 许可证

MIT
