import { StateGraph, END } from '@langchain/langgraph';
import { AgentState, type AgentStateType } from './state.js';
import { createSummaryNode } from './nodes/summary.js';
import { createIntentNode } from './nodes/intent.js';
import { createPlanNode } from './nodes/plan.js';
import { createRouterNode, routeToExecutor } from './nodes/router.js';
import { createChatExecutorNode } from './nodes/chat-executor.js';
import type { Logger } from '../logger/logger.js';
import type { ModelRegistry } from '../ai/model-registry.js';
import type { ConversationMemory } from '../memory/index.js';

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
 * - chat executor：核心对话生成 + 多模态理解，使用默认模型（高质量）
 * - 若指定模型未配置，自动回退到默认模型
 */
export function createAgentGraph(config: AgentGraphConfig) {
  const { models, logger, memory } = config;
  const agentLogger = logger.child('AgentGraph');

  const fastModel = models.has('glm') ? models.get('glm') : models.getDefault();
  const primaryModel = models.getDefault();

  const fastModelName = models.has('glm') ? 'glm' : models.getDefaultName();
  const primaryModelName = models.getDefaultName();

  agentLogger.info('Node model assignment', {
    summary: fastModelName,
    intent: primaryModelName,
    plan: primaryModelName,
    chat: primaryModelName,
  });

  // 创建各个节点
  const summaryNode = createSummaryNode(fastModel);
  const intentNode = createIntentNode(primaryModel);
  const ignoreNode = createIgnoreNode();
  const planNode = createPlanNode(primaryModel);
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

  // 构建图
  const graph = new StateGraph(AgentState)
    .addNode('summarizer', wrapNode('summarizer', summaryNode))
    .addNode('intentRecognizer', wrapNode('intentRecognizer', intentNode))
    .addNode('ignoreHandler', wrapNode('ignoreHandler', ignoreNode))
    .addNode('planner', wrapNode('planner', planNode))
    .addNode('router', wrapNode('router', routerNode))
    .addNode('chatExecutor', wrapNode('chatExecutor', chatExecutorNode))
    // 边：summarizer -> intentRecognizer -> (ignore? -> END : planner -> router -> executor -> END)
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
      // 后续可扩展更多执行器
    })
    .addEdge('chatExecutor', END);

  return graph.compile();
}

export type CompiledAgentGraph = ReturnType<typeof createAgentGraph>;
