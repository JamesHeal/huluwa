export { loadConfig, ConfigLoadError, type LoadConfigOptions } from './loader.js';
export {
  ConfigSchema,
  TargetSchema,
  OneBotSchema,
  ServerSchema,
  LoggingSchema,
  type Config,
  type Target,
  type OneBotConfig,
  type ServerConfig,
  type LoggingConfig,
  type LogFileConfig,
} from './schema.js';
export { substituteEnvVars, substituteEnvVarsInObject } from './env-substitution.js';
