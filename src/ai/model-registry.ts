import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { AIConfig } from '../config/schema.js';
import type { Logger } from '../logger/logger.js';
import { createChatModel } from './provider.js';

/**
 * AI 模型注册表
 *
 * 持有所有已配置的 AI 模型实例，供不同 agent 节点按名称获取
 */
export class ModelRegistry {
  private readonly models = new Map<string, BaseChatModel>();
  private readonly defaultName: string;

  constructor(config: AIConfig, logger: Logger) {
    const registryLogger = logger.child('ModelRegistry');
    this.defaultName = config.default;

    for (const [name, providerConfig] of Object.entries(config.providers)) {
      registryLogger.info(`Initializing model: ${name}`, {
        provider: providerConfig.provider,
        model: providerConfig.model,
      });

      const model = createChatModel(providerConfig);
      this.models.set(name, model);
    }

    registryLogger.info('All models initialized', {
      count: this.models.size,
      default: this.defaultName,
      names: this.getNames(),
    });
  }

  /** 获取默认模型 */
  getDefault(): BaseChatModel {
    return this.get(this.defaultName);
  }

  /** 按名称获取模型 */
  get(name: string): BaseChatModel {
    const model = this.models.get(name);
    if (!model) {
      throw new Error(
        `Model "${name}" not found. Available: ${this.getNames().join(', ')}`
      );
    }
    return model;
  }

  /** 检查模型是否存在 */
  has(name: string): boolean {
    return this.models.has(name);
  }

  /** 获取所有模型名称 */
  getNames(): string[] {
    return Array.from(this.models.keys());
  }

  /** 获取默认模型名称 */
  getDefaultName(): string {
    return this.defaultName;
  }
}
