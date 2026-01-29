import { StateGraph, END } from '@langchain/langgraph';
import { AgentState, type AgentStateType } from './state.js';
import { createSummaryNode } from './nodes/summary.js';
import { createIntentNode } from './nodes/intent.js';
import { createPlanNode } from './nodes/plan.js';
import { createRouterNode, routeToExecutor } from './nodes/router.js';
import { createChatExecutorNode } from './nodes/chat-executor.js';
import { createToolExecutorNode } from './nodes/tool-executor.js';
import type { Logger } from '../logger/logger.js';
import type { ModelRegistry } from '../ai/model-registry.js';
import type { ConversationMemory } from '../memory/index.js';
import type { ToolRegistry } from '../tools/index.js';
import type { ToolsConfig } from '../config/schema.js';

/**
 * Intent 路由条件函数
 *
 * ignore 意图直接跳过后续处理
 */
function routeAfterIntent(state: AgentStateType): 'ignore' | 'continue' {
  if (state.intent?.type === 'ignore') {
    return 'ignore';
  }
  return 'continue';
}

/**
 * Ignore 处理节点 - 设置空响应
 */
function createIgnoreNode() {
  return async (_state: AgentStateType): Promise<Partial<AgentStateType>> => {
    return { response: '' };
  };
}

export interface AgentGraphConfig {
  models: ModelRegistry;
  logger: Logger;
  memory?: ConversationMemory;
  /** 工具注册表（可选，如果提供则启用工具执行器） */
  tools?: ToolRegistry;
  /** 工具配置（可选） */
  toolsConfig?: ToolsConfig;
}

/**
 * 创建 Agent 工作流图（无工具版本）
 */
function createGraphWithoutTools(
  summaryNode: ReturnType<typeof createSummaryNode>,
  intentNode: ReturnType<typeof createIntentNode>,
  ignoreNode: ReturnType<typeof createIgnoreNode>,
  planNode: ReturnType<typeof createPlanNode>,
  routerNode: ReturnType<typeof createRouterNode>,
  chatExecutorNode: ReturnType<typeof createChatExecutorNode>,
  wrapNode: <T extends (state: AgentStateType) => Promise<Partial<AgentStateType>>>(
    name: string,
    node: T
  ) => (state: AgentStateType) => Promise<Partial<AgentStateType>>
) {
  return new StateGraph(AgentState)
    .addNode('summarizer', wrapNode('summarizer', summaryNode))
    .addNode('intentRecognizer', wrapNode('intentRecognizer', intentNode))
    .addNode('ignoreHandler', wrapNode('ignoreHandler', ignoreNode))
    .addNode('planner', wrapNode('planner', planNode))
    .addNode('router', wrapNode('router', routerNode))
    .addNode('chatExecutor', wrapNode('chatExecutor', chatExecutorNode))
    .addEdge('__start__', 'summarizer')
    .addEdge('summarizer', 'intentRecognizer')
    .addConditionalEdges('intentRecognizer', routeAfterIntent, {
      ignore: 'ignoreHandler',
      continue: 'planner',
    })
    .addEdge('ignoreHandler', END)
    .addEdge('planner', 'router')
    .addConditionalEdges('router', routeToExecutor, {
      chat: 'chatExecutor',
    })
    .addEdge('chatExecutor', END)
    .compile();
}

/**
 * 创建 Agent 工作流图（带工具版本）
 */
function createGraphWithTools(
  summaryNode: ReturnType<typeof createSummaryNode>,
  intentNode: ReturnType<typeof createIntentNode>,
  ignoreNode: ReturnType<typeof createIgnoreNode>,
  planNode: ReturnType<typeof createPlanNode>,
  routerNode: ReturnType<typeof createRouterNode>,
  chatExecutorNode: ReturnType<typeof createChatExecutorNode>,
  toolExecutorNode: ReturnType<typeof createToolExecutorNode>,
  wrapNode: <T extends (state: AgentStateType) => Promise<Partial<AgentStateType>>>(
    name: string,
    node: T
  ) => (state: AgentStateType) => Promise<Partial<AgentStateType>>
) {
  return new StateGraph(AgentState)
    .addNode('summarizer', wrapNode('summarizer', summaryNode))
    .addNode('intentRecognizer', wrapNode('intentRecognizer', intentNode))
    .addNode('ignoreHandler', wrapNode('ignoreHandler', ignoreNode))
    .addNode('planner', wrapNode('planner', planNode))
    .addNode('router', wrapNode('router', routerNode))
    .addNode('chatExecutor', wrapNode('chatExecutor', chatExecutorNode))
    .addNode('toolExecutor', wrapNode('toolExecutor', toolExecutorNode))
    .addEdge('__start__', 'summarizer')
    .addEdge('summarizer', 'intentRecognizer')
    .addConditionalEdges('intentRecognizer', routeAfterIntent, {
      ignore: 'ignoreHandler',
      continue: 'planner',
    })
    .addEdge('ignoreHandler', END)
    .addEdge('planner', 'router')
    .addConditionalEdges('router', routeToExecutor, {
      chat: 'chatExecutor',
      tool: 'toolExecutor',
    })
    .addEdge('chatExecutor', END)
    .addEdge('toolExecutor', END)
    .compile();
}

/**
 * 创建 Agent 工作流图
 *
 * 流程：
 * 1. Summary：总结输入消息
 * 2. Intent：识别用户意图
 * 3. Plan：生成执行计划
 * 4. Router：根据计划选择执行器
 * 5. Executor：执行对话/任务，生成回复
 *
 * 节点模型分配策略：
 * - summary：文本压缩，轻量任务，优先使用 "glm"（快速、低成本）
 * - intent / plan：决策关键节点，使用默认模型（高质量，保证准确性）
 * - chat / tool executor：核心功能，使用默认模型（高质量）
 * - 若指定模型未配置，自动回退到默认模型
 */
export function createAgentGraph(config: AgentGraphConfig) {
  const { models, logger, memory, tools, toolsConfig } = config;
  const agentLogger = logger.child('AgentGraph');

  const fastModel = models.has('glm') ? models.get('glm') : models.getDefault();
  const primaryModel = models.getDefault();

  const fastModelName = models.has('glm') ? 'glm' : models.getDefaultName();
  const primaryModelName = models.getDefaultName();

  const hasTools = tools && tools.size > 0;

  agentLogger.info('Node model assignment', {
    summary: fastModelName,
    intent: primaryModelName,
    plan: primaryModelName,
    chat: primaryModelName,
    tool: hasTools ? primaryModelName : 'disabled',
  });

  if (hasTools) {
    agentLogger.info('Tools enabled', {
      count: tools.size,
      names: tools.getNames(),
    });
  }

  // 创建各个节点
  const summaryNode = createSummaryNode(fastModel);
  const intentNode = createIntentNode(primaryModel);
  const ignoreNode = createIgnoreNode();

  // Plan 节点需要工具描述
  const planNode = createPlanNode(primaryModel, {
    toolDescriptions: hasTools ? tools.getToolDescriptions() : undefined,
  });

  const routerNode = createRouterNode();
  const chatExecutorNode = createChatExecutorNode(primaryModel, memory);

  // 包装节点以添加日志
  const wrapNode = <T extends (state: AgentStateType) => Promise<Partial<AgentStateType>>>(
    name: string,
    node: T
  ) => {
    return async (state: AgentStateType): Promise<Partial<AgentStateType>> => {
      agentLogger.debug(`Entering node: ${name}`);
      const startTime = Date.now();

      try {
        const result = await node(state);
        const duration = Date.now() - startTime;
        agentLogger.debug(`Exiting node: ${name}`, { durationMs: duration });
        return result;
      } catch (error) {
        agentLogger.error(`Error in node: ${name}`, {
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    };
  };

  // 根据是否有工具，选择不同的图结构
  if (hasTools) {
    const toolExecutorNode = createToolExecutorNode(
      primaryModel,
      tools,
      memory,
      toolsConfig
    );
    return createGraphWithTools(
      summaryNode,
      intentNode,
      ignoreNode,
      planNode,
      routerNode,
      chatExecutorNode,
      toolExecutorNode,
      wrapNode
    );
  }

  return createGraphWithoutTools(
    summaryNode,
    intentNode,
    ignoreNode,
    planNode,
    routerNode,
    chatExecutorNode,
    wrapNode
  );
}

export type CompiledAgentGraph = ReturnType<typeof createAgentGraph>;
