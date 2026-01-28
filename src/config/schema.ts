import { z } from 'zod';

export const TargetSchema = z.object({
  type: z.enum(['private', 'group']),
  id: z.number().int().positive(),
});

export const OneBotSchema = z.object({
  httpUrl: z.string().url(),
  accessToken: z.string().optional(),
  webhookPath: z.string().startsWith('/').default('/onebot'),
});

export const ServerSchema = z.object({
  port: z.number().int().min(1).max(65535).default(3000),
  host: z.string().default('0.0.0.0'),
});

export const LogFileSchema = z.object({
  enabled: z.boolean().default(true),
  directory: z.string().default('./logs'),
});

export const LoggingSchema = z.object({
  level: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  file: LogFileSchema.default({}),
  consoleFormat: z.enum(['pretty', 'json']).default('pretty'),
});

export const ConfigSchema = z.object({
  target: TargetSchema,
  onebot: OneBotSchema,
  server: ServerSchema.default({}),
  logging: LoggingSchema.default({}),
});

export type Target = z.infer<typeof TargetSchema>;
export type OneBotConfig = z.infer<typeof OneBotSchema>;
export type ServerConfig = z.infer<typeof ServerSchema>;
export type LogFileConfig = z.infer<typeof LogFileSchema>;
export type LoggingConfig = z.infer<typeof LoggingSchema>;
export type Config = z.infer<typeof ConfigSchema>;
