import pg from 'pg';

/**
 * Creates a small PostgreSQL connection pool.
 * @param {string} databaseUrl
 * @param {import('../lib/logger.js').Logger} logger
 */
export function createPool(databaseUrl, logger) {
  const pool = new pg.Pool({
    connectionString: databaseUrl,
    max: 5,
    connectionTimeoutMillis: 2000,
    idleTimeoutMillis: 30_000,
  });
  // Without this listener, an idle client error (e.g. DB restarted) would crash the process.
  pool.on('error', (err) => logger.warn('db_pool_error', { error: err }));
  return pool;
}

/**
 * @typedef {{ ok: true, pgvector: boolean } | { ok: false, error: string }} DatabaseStatus
 */

/**
 * Checks that the database answers and whether the pgvector extension is available.
 * Never throws: health checks must report, not crash.
 * @param {pg.Pool|null} pool
 * @param {{ timeoutMs?: number }} [options]
 * @returns {Promise<DatabaseStatus>}
 */
export async function checkDatabase(pool, { timeoutMs = 1500 } = {}) {
  if (!pool) return { ok: false, error: 'not_configured' };
  /** @type {NodeJS.Timeout|undefined} */
  let timer;
  try {
    const query = pool.query(
      "select exists(select 1 from pg_available_extensions where name = 'vector') as pgvector",
    );
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(Object.assign(new Error('timeout'), { code: 'timeout' })), timeoutMs);
    });
    const result = /** @type {pg.QueryResult} */ (await Promise.race([query, timeout]));
    return { ok: true, pgvector: Boolean(result.rows[0]?.pgvector) };
  } catch (err) {
    return { ok: false, error: /** @type {any} */ (err)?.code ?? 'unreachable' };
  } finally {
    clearTimeout(timer);
  }
}
