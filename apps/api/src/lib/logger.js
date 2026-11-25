/**
 * Structured JSON logger with PII masking.
 * One JSON object per line on stdout: Cloud Logging (Cloud Run) parses `severity` and `message`.
 */

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40, silent: 100 };

/** Object keys whose values are always hidden, whatever they contain. */
const SENSITIVE_KEY =
  /^(authorization|cookie|set-cookie|password|passwd|secret|client[-_]?secret|token|access[-_]?token|refresh[-_]?token|id[-_]?token|api[-_]?key|apikey|x-api-key|private[-_]?key)$/i;

/** Ordered replacements applied to every string. Order matters: specific patterns first. */
const STRING_RULES = [
  // "Bearer <token>"
  [/\bBearer\s+[A-Za-z0-9\-._~+/]+=*/gi, 'Bearer [REDACTED]'],
  // JWTs (e.g. Firebase ID tokens)
  [/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[REDACTED_JWT]'],
  // Common API key shapes: sk-..., Google AIza...
  [/\b(?:sk|pk|rk)-[A-Za-z0-9_-]{16,}/g, '[REDACTED_KEY]'],
  [/\bAIza[0-9A-Za-z_-]{30,}/g, '[REDACTED_KEY]'],
  // key=value in URLs or query strings
  [/\b(api[_-]?key|key|token|access_token|secret|password)=([^&\s"']+)/gi, '$1=[REDACTED]'],
  // E-mail
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[EMAIL]'],
  // CPF: 123.456.789-09 or 12345678909
  [/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, '[CPF]'],
  // Brazilian phone: +55 (11) 91234-5678, 11 91234-5678, (11) 3456-7890
  [/(?:\+?55\s?)?(?:\(\d{2}\)|\b\d{2})\s?9?\d{4}[-\s]?\d{4}\b/g, '[PHONE]'],
];

/**
 * Masks PII and secrets in any value (strings, arrays, plain objects, errors).
 * @param {unknown} value
 * @param {number} [depth]
 * @returns {unknown}
 */
export function maskPII(value, depth = 0) {
  if (typeof value === 'string') {
    return STRING_RULES.reduce((text, [pattern, replacement]) => text.replace(pattern, replacement), value);
  }
  if (value === null || typeof value !== 'object') return value;
  if (depth > 8) return '[TRUNCATED]';
  if (value instanceof Error) {
    return maskPII({ name: value.name, message: value.message, code: /** @type {any} */ (value).code }, depth + 1);
  }
  if (Array.isArray(value)) return value.map((item) => maskPII(item, depth + 1));
  /** @type {Record<string, unknown>} */
  const out = {};
  for (const [key, inner] of Object.entries(value)) {
    out[key] = SENSITIVE_KEY.test(key) ? '[REDACTED]' : maskPII(inner, depth + 1);
  }
  return out;
}

/**
 * @typedef {(message: string, fields?: Record<string, unknown>) => void} LogFn
 * @typedef {{ debug: LogFn, info: LogFn, warn: LogFn, error: LogFn, child: (bindings: Record<string, unknown>) => Logger }} Logger
 */

/**
 * @param {{ level?: keyof LEVELS, sink?: (line: string) => void, bindings?: Record<string, unknown> }} [options]
 * @returns {Logger}
 */
export function createLogger({ level = 'info', sink = (line) => process.stdout.write(`${line}\n`), bindings = {} } = {}) {
  const threshold = LEVELS[level] ?? LEVELS.info;

  /** @param {'debug'|'info'|'warn'|'error'} lvl */
  const write = (lvl) => (message, fields = {}) => {
    if (LEVELS[lvl] < threshold) return;
    const entry = maskPII({
      severity: lvl.toUpperCase(),
      time: new Date().toISOString(),
      message,
      ...bindings,
      ...fields,
    });
    sink(JSON.stringify(entry));
  };

  return {
    debug: write('debug'),
    info: write('info'),
    warn: write('warn'),
    error: write('error'),
    child: (extra) => createLogger({ level, sink, bindings: { ...bindings, ...extra } }),
  };
}

/** A logger that discards everything (handy in tests). */
export const silentLogger = createLogger({ level: 'silent' });
