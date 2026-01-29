import { Annotation } from '@langchain/langgraph';
import type { AggregatedMessages } from '../pipeline/index.js';

/**
 * 意图类型
 */
export type IntentType =
  | 'chat' // 普通对话
  | 'question' // 提问
  | 'command' // 命令/指令
  | 'unknown'; // 无法识别

/**
 * 意图识别结果
 */
export interface Intent {
  type: IntentType;
  confidence: number;
  description: string;
}

/**
 * 执行计划
 */
export interface Plan {
  steps: PlanStep[];
  executorType: string;
}

export interface PlanStep {
  action: string;
  description: string;
}

/**
 * Agent 工作流状态
 *
 * 使用 LangGraph Annotation 定义状态结构
 */
export const AgentState = Annotation.Root({
  // 输入：聚合后的消息
  input: Annotation<AggregatedMessages>,

  // Summary Agent 输出
  summary: Annotation<string | undefined>,

  // Intent Agent 输出
  intent: Annotation<Intent | undefined>,

  // Plan Agent 输出
  plan: Annotation<Plan | undefined>,

  // Router 输出：选择的执行器类型
  executorType: Annotation<string | undefined>,

  // Executor 输出：最终回复
  response: Annotation<string | undefined>,

  // 错误信息（如果有）
  error: Annotation<string | undefined>,
});

export type AgentStateType = typeof AgentState.State;
