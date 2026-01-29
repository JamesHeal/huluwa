import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import {
  HumanMessage,
  SystemMessage,
  AIMessage,
  ToolMessage,
  type BaseMessage,
} from '@langchain/core/messages';
import type { AgentStateType } from '../state.js';
import type { ToolRegistry, ToolExecutionResult } from '../../tools/index.js';
import type { ConversationMemory } from '../../memory/index.js';
import { extractTargetId } from '../../memory/types.js';
import { getToolCache } from '../../tools/cache.js';
import { metrics } from '../../metrics/index.js';
import type { ToolsConfig } from '../../config/schema.js';

/** 最大 ReAct 循环次数 */
const MAX_ITERATIONS = 5;

/** 默认工具执行超时（毫秒） */
const DEFAULT_TIMEOUT_MS = 30000;

const TOOL_SYSTEM_PROMPT = `你是 Huluwa（葫芦娃），一个友好的 AI 助手。
你可以使用工具来帮助用户完成任务。

规则：
1. 仔细分析用户请求，决定是否需要使用工具
2. 如果需要使用工具，调用合适的工具并等待结果
3. 根据工具返回的结果，生成对用户友好的回复
4. 用中文回复
5. 回复要简洁自然，像朋友聊天一样
6. 不要使用 markdown 格式`;

/**
 * 带超时的 Promise 执行
 */
async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  errorMessage: string
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(errorMessage));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

/**
 * 创建 Tool Executor 节点
 *
 * 实现 ReAct 循环：
 * 1. 绑定工具到模型
 * 2. 调用模型，检查是否有 tool_calls
 * 3. 如有，执行工具（带缓存、超时和 metrics）并添加 ToolMessage
 * 4. 循环直到模型不再调用工具或达到最大次数
 * 5. 返回最终响应
 */
export function createToolExecutorNode(
  model: BaseChatModel,
  toolRegistry: ToolRegistry,
  memory?: ConversationMemory,
  toolsConfig?: ToolsConfig
) {
  // 初始化工具缓存
  const cacheEnabled = toolsConfig?.cache?.enabled ?? true;
  const cacheMaxSize = toolsConfig?.cache?.maxSize ?? 100;
  const defaultTimeoutMs = toolsConfig?.defaultTimeoutMs ?? DEFAULT_TIMEOUT_MS;
  const toolCache = cacheEnabled ? getToolCache(cacheMaxSize) : undefined;
  return async (state: AgentStateType): Promise<Partial<AgentStateType>> => {
    const { input, summary, intent, plan } = state;

    // 根据 toolHints 筛选工具，否则使用全部
    const toolHints = plan?.toolHints;
    const tools =
      toolHints && toolHints.length > 0
        ? toolRegistry.getByNames(toolHints)
        : toolRegistry.getAll();

    if (tools.length === 0) {
      // 没有可用工具，回退到简单回复
      return {
        response: '抱歉，当前没有可用的工具来处理这个请求。',
        error: 'No tools available',
      };
    }

    // 绑定工具到模型
    // BaseChatModel 可能不支持 bindTools，需要类型断言
    const modelWithTools = (
      model as BaseChatModel & {
        bindTools: (tools: unknown[]) => BaseChatModel;
      }
    ).bindTools(tools);

    // 构建初始上下文
    let context = '';

    // 注入历史对话
    if (memory?.isEnabled()) {
      const isGroup = input.isGroup;
      const targetId = extractTargetId(input);
      const currentQuery = input.plainText;
      const history = await memory.getHistory(isGroup, targetId, currentQuery);
      if (history) {
        context += `[历史对话]\n${history}\n\n`;
      }
    }

    if (input.count > 1 && summary) {
      context += `[消息摘要] ${summary}\n\n`;
    }

    if (intent) {
      context += `[识别的意图] ${intent.description}\n\n`;
    }

    context += `[当前消息]\n${input.formattedText}`;

    // 初始化消息列表（使用 BaseMessage 类型支持 AI/Tool 消息）
    const messages: BaseMessage[] = [
      new SystemMessage(TOOL_SYSTEM_PROMPT),
      new HumanMessage(context),
    ];

    const allToolResults: ToolExecutionResult[] = [];
    let iterations = 0;
    let finalResponse = '';

    // ReAct 循环
    while (iterations < MAX_ITERATIONS) {
      iterations++;

      const response = await modelWithTools.invoke(messages);

      // 检查是否有工具调用
      const toolCalls = response.tool_calls;

      if (!toolCalls || toolCalls.length === 0) {
        // 没有工具调用，提取最终响应
        finalResponse =
          typeof response.content === 'string'
            ? response.content
            : JSON.stringify(response.content);
        break;
      }

      // 添加 AI 响应到消息列表
      messages.push(
        new AIMessage({
          content: response.content,
          tool_calls: toolCalls,
        })
      );

      // 并行执行所有工具调用（带缓存、超时和 metrics）
      const toolPromises = toolCalls.map(async (toolCall) => {
        const startTime = Date.now();
        const toolName = toolCall.name;
        const toolCallId = toolCall.id ?? `tool_${Date.now()}`;
        const toolArgs = toolCall.args as unknown;

        const tool = toolRegistry.get(toolName);
        const toolDef = toolRegistry.getDefinition(toolName);

        if (!tool) {
          metrics.recordToolExecution(toolName, false, 0, false);
          return {
            result: {
              toolName,
              toolCallId,
              success: false,
              output: '',
              error: `工具 "${toolName}" 不存在`,
              durationMs: Date.now() - startTime,
              cached: false,
            } satisfies ToolExecutionResult,
            message: new ToolMessage({
              tool_call_id: toolCallId,
              content: `错误：工具 "${toolName}" 不存在`,
            }),
          };
        }

        // 检查缓存
        const cacheTTL = toolDef?.cacheTTL ?? 0;
        if (toolCache && cacheTTL > 0) {
          const cachedResult = toolCache.get(toolName, toolArgs);
          if (cachedResult !== undefined) {
            const durationMs = Date.now() - startTime;
            metrics.recordToolExecution(toolName, true, durationMs, true);
            return {
              result: {
                toolName,
                toolCallId,
                success: true,
                output: cachedResult,
                durationMs,
                cached: true,
              } satisfies ToolExecutionResult,
              message: new ToolMessage({
                tool_call_id: toolCallId,
                content: cachedResult,
              }),
            };
          }
        }

        // 确定超时时间
        const timeoutMs = toolDef?.timeoutMs ?? defaultTimeoutMs;

        try {
          // 带超时执行
          const output = await withTimeout(
            tool.invoke(toolArgs),
            timeoutMs,
            `工具 "${toolName}" 执行超时 (${timeoutMs}ms)`
          );
          const durationMs = Date.now() - startTime;
          const outputStr = String(output);

          // 缓存结果
          if (toolCache && cacheTTL > 0) {
            toolCache.set(toolName, toolArgs, outputStr, cacheTTL);
          }

          metrics.recordToolExecution(toolName, true, durationMs, false);

          return {
            result: {
              toolName,
              toolCallId,
              success: true,
              output: outputStr,
              durationMs,
              cached: false,
            } satisfies ToolExecutionResult,
            message: new ToolMessage({
              tool_call_id: toolCallId,
              content: outputStr,
            }),
          };
        } catch (error) {
          const durationMs = Date.now() - startTime;
          const errorMsg =
            error instanceof Error ? error.message : String(error);

          metrics.recordToolExecution(toolName, false, durationMs, false);

          return {
            result: {
              toolName,
              toolCallId,
              success: false,
              output: '',
              error: errorMsg,
              durationMs,
              cached: false,
            } satisfies ToolExecutionResult,
            message: new ToolMessage({
              tool_call_id: toolCallId,
              content: `执行失败：${errorMsg}`,
            }),
          };
        }
      });

      const toolResults = await Promise.all(toolPromises);

      // 收集结果并添加 ToolMessage 到消息列表
      for (const { result, message } of toolResults) {
        allToolResults.push(result);
        messages.push(message);
      }
    }

    // 如果循环结束但没有最终响应（达到最大迭代次数）
    if (!finalResponse && iterations >= MAX_ITERATIONS) {
      finalResponse = '抱歉，任务处理超时，请尝试简化请求。';
    }

    // 保存本轮对话到记忆
    if (memory?.isEnabled() && finalResponse) {
      await memory.addTurn(input, finalResponse);
    }

    return {
      response: finalResponse,
      toolResults: allToolResults.length > 0 ? allToolResults : undefined,
      toolIterations: iterations,
    };
  };
}
