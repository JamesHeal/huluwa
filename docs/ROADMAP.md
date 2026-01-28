# iMessage AI Bot - 落地计划

> 版本: 1.0
> 日期: 2026-01-28
> 状态: 规划中

---

## 开发阶段总览

```
Phase 1        Phase 2        Phase 3        Phase 4        Phase 5        Phase 6
基础框架 ──────→ 消息处理 ──────→ Agent ──────→ 上下文 ──────→ 沙盒 ──────→ Web UI
                Pipeline       & 知识库       能力
   │              │              │              │              │              │
   ▼              ▼              ▼              ▼              ▼              ▼
 可收发消息    智能触发      AI 对话       长期记忆       工具调用      可视化管理
```

---

## Phase 1: 基础框架

### 目标
搭建项目骨架，实现与 BlueBubbles 的基本集成，能够收发 iMessage 消息。

### 任务清单

| # | 任务 | 说明 | 验收标准 |
|---|------|------|----------|
| 1.1 | 项目初始化 | Node.js 项目结构、TypeScript 配置、ESLint、依赖管理 | `npm run build` 成功 |
| 1.2 | 配置系统 | YAML 配置加载、环境变量支持、配置校验 | 能加载并校验 config.yaml |
| 1.3 | 日志系统 | 结构化日志、日志级别、文件输出 | 日志正确输出到控制台和文件 |
| 1.4 | BlueBubbles Client | REST API 封装、认证、错误处理 | 能调用 BlueBubbles API |
| 1.5 | Webhook Server | HTTP 服务器、Webhook 接收、签名验证 | 能接收 BlueBubbles 推送 |
| 1.6 | 消息收发 | 接收消息事件、发送文本消息 | 收到消息后能回复 "收到" |

### 产出物
- 可运行的 Node.js 应用
- BlueBubbles 集成模块
- 配置和日志基础设施

### 依赖
- BlueBubbles Server 已安装并运行
- macOS 环境

---

## Phase 2: 消息处理

### 目标
实现智能的消息触发机制，包括 Debounce、消息过滤、队列管理。

### 任务清单

| # | 任务 | 说明 | 验收标准 |
|---|------|------|----------|
| 2.1 | 消息过滤器 | 根据 chat_guid 过滤，只处理目标群聊 | 非目标消息被忽略 |
| 2.2 | 消息队列 | 未处理消息缓冲、FIFO 队列 | 消息按顺序入队 |
| 2.3 | Typing Indicator | 检测 BlueBubbles typing 状态 | 能获取输入状态 |
| 2.4 | Debounce 机制 | 有人输入时等待，无输入时触发 | 正确触发时机 |
| 2.5 | 消息聚合 | 多条消息合并处理，保留发送者信息 | 聚合结果正确 |
| 2.6 | 进度反馈 | 长任务开始时发送提示消息 | 用户收到进度提示 |

### 产出物
- 消息处理管道
- Debounce 控制器
- 消息聚合器

### 技术要点
```typescript
interface MessageQueue {
  enqueue(message: IncomingMessage): void;
  flush(): Message[];
  isEmpty(): boolean;
}

interface DebounceController {
  onMessage(message: IncomingMessage): void;
  onTypingStart(chatGuid: string): void;
  onTypingStop(chatGuid: string): void;
  onTrigger(callback: (messages: Message[]) => void): void;
}
```

---

## Phase 3: Multi-Agent Pipeline

### 目标
实现基于 LangGraph 的 Multi-Agent 架构，包括 Summary、Intent、Plan、Execute 四个阶段。

### 任务清单

| # | 任务 | 说明 | 验收标准 |
|---|------|------|----------|
| 3.1 | AI Provider 抽象 | 统一接口、多 Provider 支持、热插拔 | 可切换 Claude/OpenAI |
| 3.2 | LangGraph 集成 | 图结构定义、状态管理 | Graph 能执行 |
| 3.3 | Summary Agent | 多消息总结、保留发送者区分 | 总结质量达标 |
| 3.4 | Intent Agent | 意图识别、分类 | 意图识别准确 |
| 3.5 | Plan Agent | 任务规划、步骤分解 | 计划合理可执行 |
| 3.6 | Router 节点 | 根据 Intent/Plan 路由到执行器 | 路由正确 |
| 3.7 | Chat Executor | 基础对话能力 | 能正常对话 |
| 3.8 | Agent 配置加载 | 从配置文件加载 Agent 定义 | 配置生效 |

### 产出物
- AI Provider 抽象层
- LangGraph 工作流定义
- 各 Agent 节点实现

### 技术要点
```typescript
// LangGraph 状态定义
interface AgentState {
  messages: Message[];           // 输入消息
  summary?: string;              // Summary 输出
  intent?: Intent;               // Intent 输出
  plan?: Plan;                   // Plan 输出
  executorType?: string;         // Router 输出
  response?: string;             // Executor 输出
}

// Graph 定义
const graph = new StateGraph<AgentState>()
  .addNode("summary", summaryNode)
  .addNode("intent", intentNode)
  .addNode("plan", planNode)
  .addNode("router", routerNode)
  .addNode("chat", chatExecutor)
  .addNode("image", imageExecutor)
  // ... 更多 executors
  .addEdge("summary", "intent")
  .addEdge("intent", "plan")
  .addEdge("plan", "router")
  .addConditionalEdges("router", routeToExecutor);
```

---

## Phase 4: 上下文与知识库

### 目标
实现完整的上下文管理，包括热上下文、历史摘要、向量知识库。

### 任务清单

| # | 任务 | 说明 | 验收标准 |
|---|------|------|----------|
| 4.1 | 消息持久化 | 消息存储到本地文件/数据库 | 消息持久化成功 |
| 4.2 | 滑动窗口 | 获取最近 N 条消息 | 窗口大小正确 |
| 4.3 | 定期摘要 | 每 N 轮生成摘要并存储 | 摘要质量达标 |
| 4.4 | LanceDB 集成 | 向量数据库初始化、表结构 | DB 可读写 |
| 4.5 | Embedding 服务 | 文本向量化（API 或本地） | Embedding 生成成功 |
| 4.6 | 消息归档 | 超过 7 天的消息归档到知识库 | 自动归档正常 |
| 4.7 | Hybrid Search | BM25 + 向量检索 | 检索结果相关 |
| 4.8 | Reranking | 结果重排序 | 排序质量提升 |
| 4.9 | 知识库 Tool | Agent 可调用的搜索工具 | Agent 能检索历史 |

### 产出物
- 上下文管理器
- LanceDB 集成
- RAG Pipeline

### 技术要点
```typescript
interface ContextManager {
  // 热上下文
  getRecentMessages(limit?: number): Promise<Message[]>;

  // 摘要层
  getSummaries(since: Date): Promise<Summary[]>;
  generateSummary(messages: Message[]): Promise<Summary>;

  // 知识库
  archiveMessages(messages: Message[]): Promise<void>;
  searchHistory(query: string, topK?: number): Promise<SearchResult[]>;
}

interface RAGPipeline {
  embed(text: string): Promise<number[]>;
  search(query: string, options?: SearchOptions): Promise<Document[]>;
  rerank(query: string, documents: Document[]): Promise<Document[]>;
}
```

---

## Phase 5: 沙盒能力

### 目标
通过 MCP Tools 为 Agent 提供 Shell、文件系统、浏览器等执行能力。

### 任务清单

| # | 任务 | 说明 | 验收标准 |
|---|------|------|----------|
| 5.1 | MCP 框架集成 | Tool 注册、调用机制 | 框架可用 |
| 5.2 | Shell Tool | 执行命令、捕获输出 | 命令执行成功 |
| 5.3 | FileSystem Tool | 读写文件、目录操作 | 文件操作成功 |
| 5.4 | Network Tool | HTTP 请求、API 调用 | 网络请求成功 |
| 5.5 | Browser Tool | 浏览器控制（Playwright） | 能打开页面 |
| 5.6 | 权限控制 | 敏感操作审批机制 | 权限控制生效 |
| 5.7 | Tool 配置 | 从配置文件加载 Tool 定义 | 配置生效 |
| 5.8 | Image Executor | 图片处理能力 | 能处理图片任务 |
| 5.9 | 更多 Executors | 根据需要扩展 | 按需实现 |

### 产出物
- MCP Tools 集合
- 权限控制系统
- 专业 Executors

### 技术要点
```typescript
interface MCPTool {
  name: string;
  description: string;
  parameters: JSONSchema;
  requireApproval?: boolean;
  execute(params: unknown): Promise<ToolResult>;
}

interface ToolRegistry {
  register(tool: MCPTool): void;
  get(name: string): MCPTool | undefined;
  list(): MCPTool[];
  search(query: string): MCPTool[];
}
```

---

## Phase 6: Web UI

### 目标
提供可视化的管理界面，实时查看状态、日志、历史。

### 任务清单

| # | 任务 | 说明 | 验收标准 |
|---|------|------|----------|
| 6.1 | API Server | RESTful API 设计实现 | API 可调用 |
| 6.2 | WebSocket Server | 实时事件推送 | 连接稳定 |
| 6.3 | React 项目初始化 | Vite + React + TypeScript | 项目可运行 |
| 6.4 | 状态仪表盘 | Bot 运行状态、连接状态 | 状态正确显示 |
| 6.5 | 日志查看器 | 实时日志流、过滤搜索 | 日志实时更新 |
| 6.6 | 消息历史 | 查看处理过的消息和响应 | 历史可查询 |
| 6.7 | Agent 监控 | Agent 执行状态、耗时 | 执行过程可见 |
| 6.8 | 配置查看 | 当前配置展示（只读） | 配置正确显示 |

### 产出物
- 后端 API 服务
- React 前端应用
- WebSocket 实时通信

### 技术要点
```typescript
// WebSocket 事件类型
type WSEvent =
  | { type: 'message_received'; data: Message }
  | { type: 'agent_start'; data: { agent: string; input: unknown } }
  | { type: 'agent_end'; data: { agent: string; output: unknown } }
  | { type: 'tool_call'; data: { tool: string; params: unknown } }
  | { type: 'response_sent'; data: { message: string } }
  | { type: 'error'; data: { error: string } };
```

---

## Phase 7: 优化与生产化

### 目标
完善错误处理、性能优化、文档完善，使系统达到生产可用状态。

### 任务清单

| # | 任务 | 说明 | 验收标准 |
|---|------|------|----------|
| 7.1 | 错误处理完善 | 边界情况、异常恢复 | 系统稳定 |
| 7.2 | 重试机制 | Agent 失败重试逻辑 | 重试正常工作 |
| 7.3 | 性能优化 | 响应时间、资源占用 | 性能达标 |
| 7.4 | 配置 Reload | 无需重启更新配置 | 热更新生效 |
| 7.5 | 健康检查 | 系统健康监控 | 健康状态可查 |
| 7.6 | 启动脚本 | 进程管理、开机自启 | 一键启动 |
| 7.7 | 用户文档 | 安装、配置、使用指南 | 文档完整 |
| 7.8 | 开发文档 | 架构说明、扩展指南 | 可供二次开发 |

### 产出物
- 稳定可用的系统
- 完整的文档

---

## 技术依赖图

```
                    ┌─────────────┐
                    │  Phase 1   │
                    │  基础框架   │
                    └──────┬──────┘
                           │
              ┌────────────┴────────────┐
              ▼                         ▼
       ┌─────────────┐          ┌─────────────┐
       │  Phase 2   │          │  Phase 3   │
       │  消息处理   │          │  Agent     │
       └──────┬──────┘          └──────┬──────┘
              │                        │
              └───────────┬────────────┘
                          ▼
                   ┌─────────────┐
                   │  Phase 4   │
                   │ 上下文&知识库│
                   └──────┬──────┘
                          │
              ┌───────────┴───────────┐
              ▼                       ▼
       ┌─────────────┐         ┌─────────────┐
       │  Phase 5   │         │  Phase 6   │
       │  沙盒能力   │         │  Web UI    │
       └──────┬──────┘         └──────┬──────┘
              │                       │
              └───────────┬───────────┘
                          ▼
                   ┌─────────────┐
                   │  Phase 7   │
                   │ 优化&生产化 │
                   └─────────────┘
```

**关键路径：** Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 7

**可并行：**
- Phase 2 和 Phase 3 可部分并行
- Phase 5 和 Phase 6 可并行

---

## 开发优先级建议

### 第一优先级（核心功能）
1. BlueBubbles 集成（收发消息）
2. 消息 Debounce 机制
3. LangGraph Agent Pipeline
4. 基础对话能力

### 第二优先级（增强功能）
5. 上下文管理
6. 知识库检索
7. Shell/FileSystem Tools

### 第三优先级（完善体验）
8. Web UI
9. 更多 Executors
10. 性能优化

---

## 风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| BlueBubbles API 不稳定 | 消息收发失败 | 重试机制、降级处理 |
| LangGraph Node.js 文档不足 | 开发效率降低 | 参考 Python 版本、阅读源码 |
| Typing Indicator 不可用 | Debounce 降级 | Fallback 到时间间隔方案 |
| Embedding 模型选择 | 检索质量影响 | 先用 API，后续可换本地模型 |
| 上下文过长 | Token 成本高 | 严格执行摘要和归档策略 |

---

## 里程碑定义

| 里程碑 | 完成标志 | 对应阶段 |
|--------|----------|----------|
| **M1: 能说话** | Bot 能在 iMessage 中收发消息 | Phase 1 |
| **M2: 会思考** | Bot 能理解意图并给出合理回复 | Phase 2 + 3 |
| **M3: 有记忆** | Bot 能记住历史对话并检索 | Phase 4 |
| **M4: 能动手** | Bot 能执行工具完成任务 | Phase 5 |
| **M5: 可管理** | 通过 Web UI 监控和管理 | Phase 6 |
| **M6: 可上线** | 系统稳定，文档完善 | Phase 7 |

---

## 附录：技术栈清单

### 运行时 & 构建
- Node.js ≥22
- TypeScript 5.x
- pnpm (包管理)
- tsup / esbuild (构建)

### 核心依赖
- `@langchain/langgraph` - Agent 编排
- `@langchain/core` - LangChain 核心
- `vectordb` (LanceDB) - 向量数据库
- `express` / `fastify` - HTTP 服务
- `ws` - WebSocket

### 前端
- React 18
- Vite
- TailwindCSS
- WebSocket client

### 开发工具
- ESLint + Prettier
- Vitest (测试)
- tsx (开发运行)

---

## 下一步行动

1. **确认计划** - 如有调整，现在提出
2. **创建项目结构** - 初始化 Node.js 项目
3. **开始 Phase 1** - BlueBubbles 集成
