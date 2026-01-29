import type { AgentStateType } from '../state.js';

/**
 * Router 节点
 *
 * 读取 Plan 中的 executorType 决定使用哪个执行器
 */
export function createRouterNode() {
  return async (state: AgentStateType): Promise<Partial<AgentStateType>> => {
    const executorType = state.plan?.executorType ?? 'chat';
    return { executorType };
  };
}

/**
 * 路由条件函数
 *
 * 用于 LangGraph 条件边，根据 executorType 决定下一个节点
 */
export function routeToExecutor(state: AgentStateType): string {
  return state.executorType ?? 'chat';
}
