# iMessage AI Bot - 产品需求文档 (PRD)

> 版本: 1.0
> 日期: 2026-01-28
> 状态: 需求确认完成，待开发

---

## 1. 项目概述

### 1.1 项目背景

基于 [Moltbot](https://github.com/clawdbot/clawdbot) 架构思想，开发一个 iMessage AI Bot。Moltbot 是一个本地优先的多平台 AI 助手，通过 WebSocket Gateway 作为控制中心，支持多种消息平台集成。

### 1.2 项目目标

开发一个可以加入 iMessage 群聊/私聊的 AI Bot，具备：
- 完整的群聊上下文感知能力
- 可配置的 Multi-Agent 架构
- 丰富的沙盒执行能力（浏览器、Shell、文件系统等）
- 智能的知识库检索能力

### 1.3 核心价值

- **智能对话**：理解群聊上下文，智能响应用户需求
- **任务执行**：通过 Multi-Agent 协作完成复杂任务
- **知识管理**：自动归档历史消息，支持长期记忆检索

---

## 2. 系统架构

### 2.1 整体架构图

```
┌─────────────────────────────────────────────────────────────┐
│                      Bot Instance                           │
│  (每个实例服务一个目标群聊/私聊，独立服务器环境)              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  BlueBubbles Integration                            │    │
│  │  - Webhook 接收消息                                  │    │
│  │  - REST API 发送消息                                 │    │
│  │  - 输入状态检测 (typing indicator)                   │    │
│  └─────────────────────────────────────────────────────┘    │
│                        ↓                                    │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  Message Queue + Debounce                           │    │
│  │  - 检测到用户输入 → 等待                             │    │
│  │  - 无输入 → 触发处理                                 │    │
│  └─────────────────────────────────────────────────────┘    │
│                        ↓                                    │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  Multi-Agent Pipeline (LangGraph)                   │    │
│  │  ┌────────────┐                                     │    │
│  │  │  Summary   │ (多条消息时，保留发送者区分)         │    │
│  │  └─────┬──────┘                                     │    │
│  │        ↓                                            │    │
│  │  ┌────────────┐                                     │    │
│  │  │  Intent    │ 意图识别                            │    │
│  │  └─────┬──────┘                                     │    │
│  │        ↓                                            │    │
│  │  ┌────────────┐                                     │    │
│  │  │   Plan     │ 任务规划                            │    │
│  │  └─────┬──────┘                                     │    │
│  │        ↓                                            │    │
│  │  ┌────────────┐                                     │    │
│  │  │  Execute   │ → Chat / Image / Finance / ...     │    │
│  │  └────────────┘                                     │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  ┌──────────────────────┐  ┌────────────────────────────┐   │
│  │  Context Store       │  │  Knowledge Base            │   │
│  │  (Hot: 7 days)       │  │  (LanceDB, >7 days)        │   │
│  └──────────────────────┘  └────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  Sandbox Capabilities (MCP Tools)                   │    │
│  │  Shell | FileSystem | Network | Browser | iMessage  │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  Web UI (React + WebSocket)                         │    │
│  │  状态监控 | 日志查看 | 历史管理                       │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 实例模型

- **一个实例 = 一个目标（群聊或私聊）**
- 每个实例是独立的服务器环境
- 配置文件指定目标群聊/私聊的 `chat_guid`
- 非目标来源的消息直接忽略
- 多实例部署 = 多个独立进程

---

## 3. 功能需求

### 3.1 消息触发机制

| 特性 | 说明 |
|------|------|
| 触发条件 | 基于 BlueBubbles typing indicator 检测 |
| Debounce 策略 | 检测到用户正在输入 → 等待；无输入 → 处理 |
| Fallback | 若无法检测输入状态，使用 1 秒时间间隔 |
| 消息处理 | 1 条直接处理；多条先经过 Summary Agent |

### 3.2 Multi-Agent 架构

```
消息输入
    ↓
┌──────────────────┐
│  Summary Agent   │  多条消息时：总结并保留发送者区分
└────────┬─────────┘
         ↓
┌──────────────────┐
│  Intent Agent    │  识别用户意图
└────────┬─────────┘
         ↓
┌──────────────────┐
│  Plan Agent      │  制定执行计划
└────────┬─────────┘
         ↓
┌──────────────────┐
│  Router          │  根据任务类型分发
└────────┬─────────┘
         ↓
┌────────┴────────┬──────────────┬──────────────┐
│  Chat Executor  │ Image Executor│ Finance Executor│ ...
└─────────────────┴──────────────┴──────────────┘
```

**Agent 配置要求：**
- 存储：YAML/JSON 配置文件
- 权限：只读，仅支持手动修改
- 生效：修改后需重启（后续可支持 reload）

### 3.3 上下文管理

| 类型 | 时间范围 | 存储方式 | 访问方式 |
|------|----------|----------|----------|
| Hot Context | 最近 7 天 | 内存/文件 | AI 直接可见 |
| Knowledge Base | 超过 7 天 | LanceDB 向量库 | AI 主动检索 |

**上下文策略：**
- 滑动窗口：保留最近 N 条消息
- 定期摘要：每 8-10 轮对话生成摘要
- 记忆提取：关键事实存入长期记忆

### 3.4 知识库（RAG）

**Pipeline：**
```
用户查询 → Query Classification → Hybrid Search (BM25 + Vector)
         → Reranking → Context Repacking → LLM 生成答案
```

**关键特性：**
- Hybrid Search：关键词 + 语义双路检索
- Reranking：使用 Cross-encoder 或 ColBERT 重排序
- 语义分块：按消息/对话边界切分，非固定字符数

### 3.5 沙盒能力

| 能力 | 支持 | 说明 |
|------|------|------|
| 执行 Shell 命令 | ✅ | 通过 MCP tools |
| 读写文件系统 | ✅ | 通过 MCP tools |
| 访问网络/调用 API | ✅ | 通过 MCP tools |
| 操作浏览器 | ✅ | 通过 MCP tools |
| 发送 iMessage | ✅ | 通过 BlueBubbles API |
| 修改 AI 自身 | ❌ | 禁止修改配置/代码/prompt |

**MCP Tools 配置：**
- 按需加载，不一次性注入所有 tool 定义
- 敏感操作需配置 `require_approval`
- 版本锁定，信任域隔离

### 3.6 错误处理

| 错误类型 | 处理方式 |
|----------|----------|
| Agent 执行失败 | 立即重试，最多 3 次 |
| 网络错误 | 直接失败，通知用户 |
| 所有失败 | 记录完整错误日志 |

**用户反馈：**
- 任务失败时回复："任务执行失败，稍后重试"
- 长任务开始时发送进度提示

### 3.7 AI Provider

| 特性 | 要求 |
|------|------|
| 多 Provider 支持 | OpenRouter、Claude API、OpenAI API 等 |
| 热插拔 | 运行时可切换，无需重启 |
| Per-Agent 配置 | 不同 Agent 可使用不同 Provider/Model |

### 3.8 Web UI

| 特性 | 说明 |
|------|------|
| 技术栈 | React + WebSocket |
| 实时更新 | 通过 WebSocket 推送状态变化 |
| 核心功能 | 状态监控、日志查看、历史管理 |

---

## 4. 技术约束

### 4.1 技术栈

| 组件 | 选型 |
|------|------|
| 运行时 | Node.js ≥22 |
| iMessage 集成 | BlueBubbles (REST API + Webhook) |
| 向量数据库 | LanceDB (嵌入式，零运维) |
| Agent 框架 | LangGraph |
| Web UI | React + WebSocket |
| AI Provider | 可插拔（Claude / OpenAI / OpenRouter） |

### 4.2 部署环境

- **开发/运行环境**：macOS（BlueBubbles 依赖）
- **多实例**：暂时单实例，预留多实例接口
- **BlueBubbles 依赖**：需安装 BlueBubbles Server App

### 4.3 iMessage 技术限制

**Chat GUID 格式：**
- 私聊：`iMessage;-;+15551234567`
- 群聊：`iMessage;+;group-id`

**功能支持：**
- ✅ 发送/接收消息
- ✅ 群聊支持
- ✅ 输入状态检测
- ✅ Tapback 反应
- ✅ 编辑/撤销消息 (macOS 13+)
- ✅ 回复线程

---

## 5. 配置示例

```yaml
# config.yaml

# 目标配置
target:
  type: group  # group | private
  chat_guid: "iMessage;+;chat.xxx"  # BlueBubbles chat_guid

# BlueBubbles 配置
bluebubbles:
  server_url: "http://localhost:1234"
  password: "your-password"
  webhook_path: "/webhook"

# AI Provider 配置
providers:
  claude:
    type: anthropic
    api_key: ${ANTHROPIC_API_KEY}
    default_model: claude-sonnet-4-20250514
  openai:
    type: openai
    api_key: ${OPENAI_API_KEY}
    default_model: gpt-4o
  openrouter:
    type: openrouter
    api_key: ${OPENROUTER_API_KEY}

# Agent 配置
agents:
  summary:
    provider: claude
    model: claude-haiku
  intent:
    provider: claude
  plan:
    provider: claude
  executors:
    chat:
      provider: openai
    image:
      provider: openai
      model: gpt-4o
    finance:
      provider: claude

# 上下文配置
context:
  hot_window_days: 7
  summarize_every_n_turns: 10
  sliding_window_size: 20

# 知识库配置
knowledge_base:
  type: lancedb
  path: "./data/knowledge"
  embedding_model: "text-embedding-3-small"

# MCP Tools 配置
tools:
  shell:
    enabled: true
    require_approval: false
  filesystem:
    enabled: true
    allowed_paths:
      - "./workspace"
      - "/tmp"
  browser:
    enabled: true
    require_approval: true
  network:
    enabled: true

# 错误处理
error_handling:
  max_retries: 3
  retry_immediately: true
  network_error_retry: false

# Web UI
web_ui:
  enabled: true
  port: 3000
```

---

## 6. 非功能需求

### 6.1 性能

- 消息响应延迟：debounce 后 < 5 秒内开始处理
- 长任务需发送进度提示

### 6.2 可靠性

- 错误重试机制
- 完整错误日志
- 优雅降级（Provider 不可用时切换）

### 6.3 可维护性

- 配置文件驱动
- 模块化设计
- 预留多实例扩展接口

### 6.4 安全性

- AI 不能修改自身配置/代码
- 敏感工具需审批
- MCP tools 权限隔离

---

## 7. 里程碑（待定）

| 阶段 | 内容 | 状态 |
|------|------|------|
| Phase 1 | 基础框架 + BlueBubbles 集成 | 待开始 |
| Phase 2 | Multi-Agent Pipeline | 待开始 |
| Phase 3 | 上下文管理 + 知识库 | 待开始 |
| Phase 4 | Web UI | 待开始 |
| Phase 5 | 优化 + 生产化 | 待开始 |

---

## 附录

### A. 参考项目

- [Moltbot (clawdbot)](https://github.com/clawdbot/clawdbot)
- [BlueBubbles](https://bluebubbles.app)
- [LangGraph](https://github.com/langchain-ai/langgraph)
- [LanceDB](https://lancedb.com)

### B. 文档版本历史

| 版本 | 日期 | 变更 |
|------|------|------|
| 1.0 | 2026-01-28 | 初始版本，需求确认完成 |
