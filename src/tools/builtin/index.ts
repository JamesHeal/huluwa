import type { ToolRegistry } from '../registry.js';
import type { WebSearchConfig } from '../../config/schema.js';
import { dateTimeTool } from './datetime.js';
import { urlFetchTool } from './url-fetch.js';
import { webSearchTool } from './web-search.js';

/**
 * 注册所有内置工具
 *
 * @param registry 工具注册表
 * @param webSearchConfig Web 搜索配置（可选）
 */
export function registerBuiltinTools(
  registry: ToolRegistry,
  webSearchConfig?: WebSearchConfig
): void {
  // 基础工具（始终启用）
  registry.register(dateTimeTool);
  registry.register(urlFetchTool);

  // 根据配置决定是否注册 web search 工具
  if (webSearchConfig?.enabled) {
    registry.register(webSearchTool);
  }
}

export { dateTimeTool } from './datetime.js';
export { urlFetchTool } from './url-fetch.js';
export { webSearchTool } from './web-search.js';
