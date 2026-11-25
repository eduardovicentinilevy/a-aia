import { z } from 'zod';

/** Treats empty strings from .env (e.g. `PRO_MODEL=`) as "not set". */
const blankToUndefined = (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value);

/**
 * Wraps a schema so that blank env values fall back to its default/optional behavior.
 * @template {z.ZodType} T
 * @param {T} schema
 */
const env = (schema) => z.preprocess(blankToUndefined, schema);

const EnvSchema = z
  .object({
    NODE_ENV: env(z.enum(['development', 'test', 'production']).default('development')),
    PORT: env(z.coerce.number().int().min(1).max(65535).default(8080)),
    LOG_LEVEL: env(z.enum(['debug', 'info', 'warn', 'error', 'silent']).default('info')),
    CORS_ORIGIN: env(z.string().default('http://localhost:5173')),
    DATABASE_URL: env(z.string().optional()),
    PRO_PROVIDER: env(z.enum(['mock', 'openai-compatible']).default('mock')),
    PRO_BASE_URL: env(z.url().optional()),
    PRO_API_KEY: env(z.string().optional()),
    PRO_MODEL: env(z.string().optional()),
    PRO_TIMEOUT_MS: env(z.coerce.number().int().min(1000).max(300_000).default(30_000)),
    MAX_OUTPUT_TOKENS: env(z.coerce.number().int().min(16).max(8192).default(1024)),
  })
  .superRefine((values, ctx) => {
    if (values.PRO_PROVIDER !== 'openai-compatible') return;
    for (const key of /** @type {const} */ (['PRO_BASE_URL', 'PRO_API_KEY', 'PRO_MODEL'])) {
      if (!values[key]) {
        ctx.addIssue({
          code: 'custom',
          path: [key],
          message: 'obrigatória quando PRO_PROVIDER=openai-compatible',
        });
      }
    }
  });

export class ConfigError extends Error {
  /** @param {string[]} problems */
  constructor(problems) {
    super(`Configuração inválida no .env:\n${problems.map((p) => `  - ${p}`).join('\n')}`);
    this.name = 'ConfigError';
    this.problems = problems;
  }
}

/**
 * @typedef {object} ProConfig
 * @property {'mock'|'openai-compatible'} provider
 * @property {string|undefined} baseUrl
 * @property {string|undefined} apiKey
 * @property {string|undefined} model
 * @property {number} timeoutMs
 *
 * @typedef {object} AppConfig
 * @property {'development'|'test'|'production'} nodeEnv
 * @property {number} port
 * @property {'debug'|'info'|'warn'|'error'|'silent'} logLevel
 * @property {string[]} corsOrigins
 * @property {string|undefined} databaseUrl
 * @property {ProConfig} pro
 * @property {number} maxOutputTokens
 */

/**
 * Reads and validates environment variables. Throws ConfigError listing every problem.
 * Error messages never include the values themselves (they may be secrets).
 * @param {Record<string, string|undefined>} source
 * @returns {Readonly<AppConfig>}
 */
export function loadConfig(source = process.env) {
  const result = EnvSchema.safeParse(source);
  if (!result.success) {
    const problems = result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
    throw new ConfigError(problems);
  }
  const values = result.data;
  return Object.freeze({
    nodeEnv: values.NODE_ENV,
    port: values.PORT,
    logLevel: values.LOG_LEVEL,
    corsOrigins: values.CORS_ORIGIN.split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
    databaseUrl: values.DATABASE_URL,
    pro: Object.freeze({
      provider: values.PRO_PROVIDER,
      baseUrl: values.PRO_BASE_URL,
      apiKey: values.PRO_API_KEY,
      model: values.PRO_MODEL,
      timeoutMs: values.PRO_TIMEOUT_MS,
    }),
    maxOutputTokens: values.MAX_OUTPUT_TOKENS,
  });
}
