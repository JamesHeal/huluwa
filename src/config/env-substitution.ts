/**
 * Substitutes environment variable references in a string.
 * Supports the format ${ENV_VAR_NAME}
 */
export function substituteEnvVars(value: string): string {
  return value.replace(/\$\{([^}]+)\}/g, (match, envVar: string) => {
    const envValue = process.env[envVar];
    if (envValue === undefined) {
      throw new Error(`Environment variable "${envVar}" is not defined`);
    }
    return envValue;
  });
}

/**
 * Recursively substitutes environment variables in an object.
 */
export function substituteEnvVarsInObject<T>(obj: T): T {
  if (typeof obj === 'string') {
    return substituteEnvVars(obj) as T;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => substituteEnvVarsInObject(item)) as T;
  }

  if (obj !== null && typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = substituteEnvVarsInObject(value);
    }
    return result as T;
  }

  return obj;
}
