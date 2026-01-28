import * as fs from 'node:fs';
import * as path from 'node:path';
import JSON5 from 'json5';
import { ConfigSchema, type Config } from './schema.js';
import { substituteEnvVarsInObject } from './env-substitution.js';

export class ConfigLoadError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, { cause });
    this.name = 'ConfigLoadError';
  }
}

export interface LoadConfigOptions {
  configPath?: string;
}

const DEFAULT_CONFIG_PATHS = [
  './config/config.json5',
  './config.json5',
];

function findConfigFile(basePath: string): string | null {
  for (const configPath of DEFAULT_CONFIG_PATHS) {
    const fullPath = path.resolve(basePath, configPath);
    if (fs.existsSync(fullPath)) {
      return fullPath;
    }
  }
  return null;
}

export function loadConfig(options: LoadConfigOptions = {}): Config {
  const { configPath } = options;

  let resolvedPath: string;

  if (configPath) {
    resolvedPath = path.resolve(configPath);
    if (!fs.existsSync(resolvedPath)) {
      throw new ConfigLoadError(`Config file not found: ${resolvedPath}`);
    }
  } else {
    const foundPath = findConfigFile(process.cwd());
    if (!foundPath) {
      throw new ConfigLoadError(
        `No config file found. Searched: ${DEFAULT_CONFIG_PATHS.join(', ')}`
      );
    }
    resolvedPath = foundPath;
  }

  let rawContent: string;
  try {
    rawContent = fs.readFileSync(resolvedPath, 'utf-8');
  } catch (error) {
    throw new ConfigLoadError(`Failed to read config file: ${resolvedPath}`, error);
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON5.parse(rawContent);
  } catch (error) {
    throw new ConfigLoadError(`Failed to parse JSON5: ${resolvedPath}`, error);
  }

  let substituted: unknown;
  try {
    substituted = substituteEnvVarsInObject(parsedJson);
  } catch (error) {
    throw new ConfigLoadError(
      `Failed to substitute environment variables: ${error instanceof Error ? error.message : String(error)}`,
      error
    );
  }

  const result = ConfigSchema.safeParse(substituted);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new ConfigLoadError(`Config validation failed:\n${issues}`);
  }

  return result.data;
}
