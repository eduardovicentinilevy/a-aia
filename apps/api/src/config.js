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
    // Estimated price of the Pro model, in BRL per 1 million tokens (0 on a free tier).
    PRO_COST_INPUT_BRL_PER_1M: env(z.coerce.number().min(0).default(0)),
    PRO_COST_OUTPUT_BRL_PER_1M: env(z.coerce.number().min(0).default(0)),
    FIREBASE_PROJECT_ID: env(z.string().regex(/^[a-z0-9-]{4,40}$/, 'ID de projeto inválido').optional()),
    ALLOWED_EMAILS: env(z.string().default('')),
    ADMIN_EMAILS: env(z.string().default('')),
    DAILY_TOKEN_LIMIT_PER_USER: env(z.coerce.number().int().min(0).default(50_000)),
    MONTHLY_BUDGET_BRL: env(z.coerce.number().min(0).default(150)),
  })
  .superRefine((values, ctx) => {
    /** @param {string} key @param {string} message */
    const problem = (key, message) => ctx.addIssue({ code: 'custom', path: [key], message });

    if (values.PRO_PROVIDER === 'openai-compatible') {
      for (const key of /** @type {const} */ (['PRO_BASE_URL', 'PRO_API_KEY', 'PRO_MODEL'])) {
        if (!values[key]) problem(key, 'obrigatória quando PRO_PROVIDER=openai-compatible');
      }
    }
    for (const key of /** @type {const} */ (['ALLOWED_EMAILS', 'ADMIN_EMAILS'])) {
      const invalid = parseEmails(values[key]).filter((email) => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email));
      if (invalid.length > 0) problem(key, `e-mail inválido na lista (${invalid.length})`);
    }
    // In production there is no "dev user": real login, a real database and an invite list are mandatory.
    if (values.NODE_ENV === 'production') {
      if (!values.FIREBASE_PROJECT_ID) problem('FIREBASE_PROJECT_ID', 'obrigatória em produção (login)');
      if (!values.DATABASE_URL) problem('DATABASE_URL', 'obrigatória em produção');
      if (parseEmails(values.ALLOWED_EMAILS).length + parseEmails(values.ADMIN_EMAILS).length === 0) {
        problem('ALLOWED_EMAILS', 'defina ALLOWED_EMAILS ou ADMIN_EMAILS em produção (teste fechado)');
      }
    }
  });

/**
 * Splits a comma-separated e-mail list, trimmed and lowercased.
 * @param {string} list
 */
function parseEmails(list) {
  return list
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

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
 * @property {number} costInputBrlPer1M
 * @property {number} costOutputBrlPer1M
 *
 * @typedef {object} AppConfig
 * @property {'development'|'test'|'production'} nodeEnv
 * @property {number} port
 * @property {'debug'|'info'|'warn'|'error'|'silent'} logLevel
 * @property {string[]} corsOrigins
 * @property {string|undefined} databaseUrl
 * @property {ProConfig} pro
 * @property {number} maxOutputTokens
 * @property {string|undefined} firebaseProjectId  Empty = development login bypass (single local user).
 * @property {string[]} allowedEmails  Invite list (includes admins). Empty = everybody (development only).
 * @property {string[]} adminEmails
 * @property {number} dailyTokenLimit
 * @property {number} monthlyBudgetCents  In centavos (BRL).
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
      costInputBrlPer1M: values.PRO_COST_INPUT_BRL_PER_1M,
      costOutputBrlPer1M: values.PRO_COST_OUTPUT_BRL_PER_1M,
    }),
    maxOutputTokens: values.MAX_OUTPUT_TOKENS,
    firebaseProjectId: values.FIREBASE_PROJECT_ID,
    allowedEmails: [...new Set([...parseEmails(values.ALLOWED_EMAILS), ...parseEmails(values.ADMIN_EMAILS)])],
    adminEmails: parseEmails(values.ADMIN_EMAILS),
    dailyTokenLimit: values.DAILY_TOKEN_LIMIT_PER_USER,
    monthlyBudgetCents: Math.round(values.MONTHLY_BUDGET_BRL * 100),
  });
}
