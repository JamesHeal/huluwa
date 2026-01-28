# iMessage AI Bot - 技术方案调研报告

> 版本: 1.0
> 日期: 2026-01-28

---

## 1. Multi-Agent 框架调研

### 1.1 主流框架对比

| 框架 | 开发者 | 架构模式 | 最佳场景 | 生产就绪度 |
|------|--------|----------|----------|------------|
| **LangGraph** | LangChain | 图结构工作流 | 复杂分支逻辑、状态管理 | ✅ 高 |
| **AutoGen** | Microsoft | 对话式协作 | 头脑风暴、人机交互 | ✅ 高 (v0.4) |
| **CrewAI** | CrewAI | 角色分工+任务编排 | 结构化流程、内容生产 | ⚠️ 适合原型 |

### 1.2 LangGraph（推荐）

**核心特点：**
- 将 Agent 交互建模为有向图
- 每个节点是一个处理步骤（Agent/Tool）
- 支持条件边、并行执行、循环
- 内置状态管理和持久化

**适用场景：**
- 需要复杂分支逻辑的工作流
- 多步骤决策流程
- 需要精细状态管理的应用

**Node.js 支持：**
```bash
npm install @langchain/langgraph @langchain/core
```

### 1.3 AutoGen v0.4

**核心特点：**
- 2025年1月重构版本
- 强调对话驱动的协作
- 支持人机交互和动态角色

**适用场景：**
- 需要自然语言协商的场景
- 人在回路（Human-in-the-loop）

### 1.4 CrewAI

**核心特点：**
- Crews（团队）+ Flows（流程）双层架构
- 角色导向的任务分配
- 简单直观的 API

**注意事项：**
- 更适合原型和 Demo
- 生产环境可能需要额外改造

### 1.5 选型建议

**推荐：LangGraph**

理由：
1. Intent → Plan → Execute 流程有明确分支和状态转换
2. 图结构天然支持条件路由（根据 Intent 选择 Executor）
3. LangChain 团队维护，生产成熟度高
4. Node.js 有官方支持

### 1.6 参考资料

- [LangGraph vs AutoGen vs CrewAI Complete Comparison 2025](https://latenode.com/blog/platform-comparisons-alternatives/automation-platform-comparisons/langgraph-vs-autogen-vs-crewai-complete-ai-agent-framework-comparison-architecture-analysis-2025)
- [Top AI Agent Frameworks 2025 - DataCamp](https://www.datacamp.com/tutorial/crewai-vs-langgraph-vs-autogen)
- [AI Agent Frameworks Comparison - Turing](https://www.turing.com/resources/ai-agent-frameworks)

---

## 2. MCP (Model Context Protocol) 调研

### 2.1 MCP 概述

**定义：** Anthropic 2024年11月推出的开放标准，用于标准化 AI 系统与外部工具/数据源的集成。

**发展历程：**
- 2024年11月：Anthropic 发布 MCP
- 2025年3月：OpenAI 正式采用
- 2025年12月：捐赠给 Linux Foundation (AAIF)

**核心价值：** "USB-C for AI" —— 统一 LLM 与工具的连接方式

### 2.2 最佳实践

| 实践 | 说明 |
|------|------|
| **按需加载 Tools** | 不一次性加载所有 tool 定义，使用 `search_tools` 模式动态加载 |
| **代码执行优于逐个调用** | Agent 编写代码批量调用 tools，比逐个 function call 更高效 |
| **敏感操作需人工审批** | 对危险操作配置 `require_approval` |
| **版本锁定** | 生产环境锁定 MCP server 版本 |
| **信任域隔离** | 不同来源的 tools 做隔离 |

### 2.3 安全注意事项

**2025年4月安全研究发现的问题：**
- Prompt injection 攻击
- 工具权限组合导致数据泄露
- Lookalike tools 替换攻击

**缓解措施：**
- 强认证机制
- 基于角色的访问控制 (RBAC)
- 版本锁定
- 信任域隔离

### 2.4 架构模式

```
┌─────────────────────────────────────────┐
│            AI Agent (Client)            │
└─────────────────┬───────────────────────┘
                  ↓
┌─────────────────────────────────────────┐
│           MCP Gateway (可选)            │
│     - 集中管理多个 MCP Server           │
│     - 统一认证、审计、监控              │
└─────────────────┬───────────────────────┘
                  ↓
    ┌─────────────┼─────────────┐
    ↓             ↓             ↓
┌───────┐   ┌───────┐   ┌───────┐
│ Shell │   │Browser│   │  API  │
│Server │   │Server │   │Server │
└───────┘   └───────┘   └───────┘
```

### 2.5 参考资料

- [Code execution with MCP - Anthropic Engineering](https://www.anthropic.com/engineering/code-execution-with-mcp)
- [Building effective AI agents with MCP - Red Hat](https://developers.redhat.com/articles/2026/01/08/building-effective-ai-agents-mcp)
- [MCP Official Documentation](https://modelcontextprotocol.io/)

---

## 3. 上下文管理策略调研

### 3.1 主要策略对比

| 策略 | 原理 | 优点 | 缺点 | Token 节省 |
|------|------|------|------|------------|
| **Sliding Window** | 只保留最近 N 条消息 | 简单、快速 | 丢失早期上下文 | 高 |
| **LLM Summarization** | 定期生成摘要替换原文 | 保留关键信息 | 有信息损失、增加延迟 | 60-70% |
| **Hybrid** | 滑动窗口 + 摘要 + RAG | 平衡效率和完整性 | 实现复杂 | 最优 |
| **Memory Formation** | 提取关键事实长期记忆 | 高度精简 | 需要高质量提取 | 80-90% |

### 3.2 研究发现

**最佳窗口大小：**
- 12 条消息的滑动窗口是任务型对话的最佳平衡点（University of Washington NLP 研究）

**摘要时机：**
- 超过 20 轮对话建议启用摘要
- 每 8-10 轮生成一次摘要

**性能警告：**
- NoLiMa 研究发现：随着上下文增长，模型性能会下降
- 不是"越多越好"

### 3.3 推荐策略

针对本项目的消息场景：

```
┌─────────────────────────────────────────────────────────┐
│                    消息时间线                           │
├──────────────┬──────────────────────────────────────────┤
│  最近 N 条   │ Sliding Window - AI 直接可见            │
│  (约20条)    │                                         │
├──────────────┼──────────────────────────────────────────┤
│  7天内历史   │ Periodic Summary - 分段摘要存储         │
│              │                                         │
├──────────────┼──────────────────────────────────────────┤
│  超过7天     │ Knowledge Base - 向量检索              │
│              │ AI 主动调用 search_history tool         │
└──────────────┴──────────────────────────────────────────┘
```

### 3.4 实现建议

```typescript
interface ContextManager {
  // 滑动窗口：最近 N 条完整消息
  getRecentMessages(limit: number): Message[];

  // 摘要层：7天内的分段摘要
  getSummaries(since: Date): Summary[];

  // 知识库检索：超过7天的历史
  searchHistory(query: string, topK: number): SearchResult[];

  // 自动归档：定期执行
  archiveOldMessages(): void;

  // 摘要生成：每 N 轮触发
  generateSummary(messages: Message[]): Summary;
}
```

### 3.5 参考资料

- [Efficient Context Management - JetBrains Research](https://blog.jetbrains.com/research/2025/12/efficient-context-management/)
- [LLM Chat History Summarization Guide 2025](https://mem0.ai/blog/llm-chat-history-summarization-guide-2025)
- [Context Window Management Strategies](https://www.getmaxim.ai/articles/context-window-management-strategies-for-long-context-ai-agents-and-chatbots/)

---

## 4. RAG 最佳实践调研

### 4.1 推荐 Pipeline

```
用户查询
    ↓
┌─────────────────────────┐
│ Query Classification    │  分析查询类型和意图
└───────────┬─────────────┘
            ↓
┌─────────────────────────┐
│ Query Expansion (可选)  │  HyDE: 生成假设答案辅助检索
└───────────┬─────────────┘
            ↓
┌─────────────────────────┐
│ Hybrid Search           │  BM25 (关键词) + Vector (语义)
│                         │  使用 RRF 融合结果
└───────────┬─────────────┘
            ↓
┌─────────────────────────┐
│ Reranking               │  Cross-encoder 或 ColBERT
│                         │  重排 top-K 候选
└───────────┬─────────────┘
            ↓
┌─────────────────────────┐
│ Context Repacking       │  优化上下文顺序
└───────────┬─────────────┘
            ↓
┌─────────────────────────┐
│ Summarization (可选)    │  Recomp 等方法压缩
└───────────┬─────────────┘
            ↓
         LLM 生成答案
```

### 4.2 关键组件

#### 4.2.1 Hybrid Search

**为什么需要 Hybrid：**
- 纯向量检索会漏掉精确匹配（如专有名词、ID）
- 纯关键词检索会漏掉语义相关内容

**实现方式：**
```typescript
// RRF (Reciprocal Rank Fusion) 融合
function rrf(rankings: Ranking[], k: number = 60): Score[] {
  const scores = new Map<string, number>();
  for (const ranking of rankings) {
    for (let i = 0; i < ranking.length; i++) {
      const docId = ranking[i].id;
      const score = 1 / (k + i + 1);
      scores.set(docId, (scores.get(docId) || 0) + score);
    }
  }
  return Array.from(scores.entries())
    .sort((a, b) => b[1] - a[1]);
}
```

#### 4.2.2 Reranking

**选项对比：**

| 方法 | 精度 | 速度 | 说明 |
|------|------|------|------|
| Cross-encoder | 最高 | 慢 | 每个 query-doc pair 单独计算 |
| ColBERT | 高 | 快 | Late interaction，预计算 doc embeddings |
| Cohere Rerank | 高 | 中 | API 服务 |

**推荐：** ColBERT（精度和速度的平衡）

#### 4.2.3 Chunking 策略

| 策略 | 适用场景 | 说明 |
|------|----------|------|
| 固定大小 | 简单场景 | 按字符数切分 |
| 语义分块 | 文档 | 按标题/段落边界 |
| 消息边界 | 聊天记录 | 按消息/对话边界 |

**本项目推荐：消息边界分块**
- 每条消息作为最小单元
- 相邻消息可组成 chunk（保留上下文）

### 4.3 LanceDB 特性

**优势：**
- 嵌入式，零运维
- 支持 Hybrid Search（内置 BM25）
- 支持 Full-Text Search
- Node.js 原生 SDK

**示例：**
```typescript
import * as lancedb from 'vectordb';

const db = await lancedb.connect('./data/lance');

// 创建表
const table = await db.createTable('messages', [
  { id: '1', text: 'Hello', vector: [...], timestamp: Date.now() }
]);

// Hybrid Search
const results = await table.search(queryVector)
  .where('timestamp > 1234567890')
  .limit(10)
  .execute();
```

### 4.4 参考资料

- [Optimizing RAG with Hybrid Search & Reranking - VectorHub](https://superlinked.com/vectorhub/articles/optimizing-rag-with-hybrid-search-reranking)
- [Searching for Best Practices in RAG - arXiv](https://arxiv.org/html/2407.01219v1)
- [RAG Enterprise Guide 2025](https://datanucleus.dev/rag-and-agentic-ai/what-is-rag-enterprise-guide-2025)

---

## 5. iMessage 集成调研

### 5.1 方案对比

| 方案 | 架构 | 功能完整度 | 维护性 | 推荐度 |
|------|------|------------|--------|--------|
| iMessage (imsg CLI) | JSON-RPC over stdio | 基础 | 复杂 | ⚠️ |
| **BlueBubbles** | REST API + Webhook | 完整 | 简单 | ✅ 推荐 |

### 5.2 BlueBubbles 详细分析

**架构：**
```
┌─────────────────────────────┐
│  BlueBubbles macOS App      │
│  - REST API Server          │
│  - Messages 数据库访问      │
│  - Webhook 推送             │
└─────────────────────────────┘
           ↓ HTTP
┌─────────────────────────────┐
│  Bot Application            │
│  - POST /api/v1/message/... │
│  - Webhook receiver         │
└─────────────────────────────┘
```

**功能支持：**

| 功能 | 支持 | 说明 |
|------|------|------|
| 发送/接收文本 | ✅ | 核心功能 |
| 群聊 | ✅ | 支持隔离会话 |
| 媒体附件 | ✅ | 需要配置 |
| **输入状态检测** | ✅ | 支持 typing indicator |
| Tapback 反应 | ✅ | 支持 6 种原生反应 |
| 编辑/撤销消息 | ✅ | macOS 13+ |
| 回复线程 | ✅ | Private API |
| 消息效果 | ✅ | slam, confetti 等 |

**Chat GUID 格式：**
- 私聊：`iMessage;-;+15551234567`
- 群聊：`iMessage;+;group-id`

### 5.3 Webhook 消息格式

```typescript
type NormalizedWebhookMessage = {
  // 内容
  text: string;
  attachments?: Attachment[];

  // 发送者
  senderId: string;      // 电话号码或 email
  senderName?: string;
  fromMe?: boolean;

  // 聊天标识
  isGroup: boolean;
  chatId?: number;
  chatGuid?: string;     // "iMessage;+;group-id"
  chatName?: string;

  // 消息元数据
  messageId?: string;
  timestamp?: number;

  // 回复相关
  replyToId?: string;
  replyToBody?: string;
  replyToSender?: string;
};
```

### 5.4 依赖要求

**系统要求：**
- macOS Sequoia (15)+ 或更高
- Messages 已登录 Apple ID
- BlueBubbles Server App 已安装运行

**配置要求：**
```yaml
bluebubbles:
  server_url: "http://localhost:1234"
  password: "api-password"
  webhook_path: "/bluebubbles-webhook"
```

### 5.5 参考资料

- [BlueBubbles Official](https://bluebubbles.app)
- [Moltbot BlueBubbles Extension](https://github.com/clawdbot/clawdbot/tree/main/extensions/bluebubbles)

---

## 6. 向量数据库选型

### 6.1 候选对比

| 数据库 | 部署方式 | Node.js 支持 | 特点 | 适用场景 |
|--------|----------|--------------|------|----------|
| **LanceDB** | 嵌入式 | ✅ 原生 SDK | 零运维，纯本地 | 个人/小型应用 |
| Qdrant | Docker/Binary | ✅ 官方 client | 功能强大 | 需要更多功能时 |
| Chroma | Docker/Pip | ⚠️ Python 优先 | 社区活跃 | Python 项目 |
| SQLite-vec | 嵌入式 | ✅ | 极轻量 | 极简场景 |

### 6.2 LanceDB（已选定）

**选择理由：**
1. **零运维**：嵌入式数据库，数据就是本地文件夹
2. **Node.js 原生**：官方 TypeScript SDK
3. **Hybrid Search**：内置 BM25 + 向量检索
4. **适合规模**：个人消息量完全够用
5. **易于备份**：直接拷贝文件夹

**安装：**
```bash
npm install vectordb
```

**示例：**
```typescript
import * as lancedb from 'vectordb';

// 连接（自动创建）
const db = await lancedb.connect('./data/knowledge');

// 创建表
const table = await db.createTable('messages', data);

// 搜索
const results = await table
  .search(queryVector)
  .limit(10)
  .execute();
```

---

## 7. 技术架构总结

### 7.1 最终技术栈

| 层级 | 技术选型 |
|------|----------|
| 运行时 | Node.js ≥22 |
| iMessage 集成 | BlueBubbles (REST + Webhook) |
| Agent 框架 | LangGraph |
| 向量数据库 | LanceDB |
| AI Provider | 可插拔（Claude / OpenAI / OpenRouter） |
| Web UI | React + WebSocket |

### 7.2 核心架构图

```
┌─────────────────────────────────────────────────────────────┐
│                    iMessage Bot Instance                    │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  LangGraph Orchestrator                             │    │
│  │                                                     │    │
│  │  ┌──────────┐    ┌──────────┐    ┌──────────────┐   │    │
│  │  │ Summary  │ →  │  Intent  │ →  │    Plan      │   │    │
│  │  │  Node    │    │   Node   │    │    Node      │   │    │
│  │  └──────────┘    └──────────┘    └──────┬───────┘   │    │
│  │                                         ↓           │    │
│  │                              ┌──────────────────┐   │    │
│  │                              │  Router (条件边) │   │    │
│  │                              └────────┬─────────┘   │    │
│  │                    ┌──────────────────┼────────┐    │    │
│  │                    ↓                  ↓        ↓    │    │
│  │              ┌─────────┐        ┌─────────┐  ...    │    │
│  │              │  Chat   │        │  Image  │         │    │
│  │              │ Executor│        │ Executor│         │    │
│  │              └─────────┘        └─────────┘         │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  ┌────────────────────────────────────────────────────┐     │
│  │  Context Manager                                   │     │
│  │  - Sliding Window (最近 N 条)                      │     │
│  │  - Periodic Summarization (每 8-10 轮)             │     │
│  │  - Memory Formation (关键事实提取)                 │     │
│  └────────────────────────────────────────────────────┘     │
│                                                             │
│  ┌────────────────────────────────────────────────────┐     │
│  │  RAG Pipeline (LanceDB)                            │     │
│  │  - Hybrid Search (BM25 + Vector)                   │     │
│  │  - Reranking (ColBERT 或 Cross-encoder)            │     │
│  │  - Message-boundary Chunking                       │     │
│  └────────────────────────────────────────────────────┘     │
│                                                             │
│  ┌────────────────────────────────────────────────────┐     │
│  │  MCP Tools (按需加载)                              │     │
│  │  - Browser | Shell | FileSystem | API              │     │
│  │  - require_approval for sensitive ops              │     │
│  └────────────────────────────────────────────────────┘     │
│                                                             │
│  ┌────────────────────────────────────────────────────┐     │
│  │  AI Provider Abstraction                           │     │
│  │  - Hot-swappable (Claude / OpenAI / OpenRouter)    │     │
│  │  - Per-agent provider config                       │     │
│  └────────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────┘
```

---

## 8. 待深入调研项

后续开发过程中可能需要进一步调研：

1. **LangGraph Node.js 具体用法和模式**
2. **Embedding 模型选择**（本地 vs API）
3. **ColBERT Reranking 的 Node.js 实现**
4. **MCP Server 开发规范**
5. **BlueBubbles Webhook 可靠性保障**

---

## 附录：参考资料汇总

### Multi-Agent
- https://latenode.com/blog/platform-comparisons-alternatives/automation-platform-comparisons/langgraph-vs-autogen-vs-crewai-complete-ai-agent-framework-comparison-architecture-analysis-2025
- https://www.datacamp.com/tutorial/crewai-vs-langgraph-vs-autogen

### MCP
- https://www.anthropic.com/engineering/code-execution-with-mcp
- https://developers.redhat.com/articles/2026/01/08/building-effective-ai-agents-mcp

### 上下文管理
- https://blog.jetbrains.com/research/2025/12/efficient-context-management/
- https://mem0.ai/blog/llm-chat-history-summarization-guide-2025

### RAG
- https://superlinked.com/vectorhub/articles/optimizing-rag-with-hybrid-search-reranking
- https://arxiv.org/html/2407.01219v1
