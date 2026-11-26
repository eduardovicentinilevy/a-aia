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

/**
 * A short PT-BR hint for the most common local database errors (shown in the startup log).
 * @param {string} code  PostgreSQL SQLSTATE or Node network error code.
 */
export function databaseHint(code) {
  switch (code) {
    case 'ECONNREFUSED':
    case 'timeout':
      return 'Banco fora do ar? Rode: npm run db:up (e confira a porta do DATABASE_URL).';
    case '28000': // role does not exist
    case '28P01': // wrong password
      return 'Usuário ou senha recusados. Se você tem um PostgreSQL instalado no computador, o DATABASE_URL pode estar apontando para ele: use postgres://acaia:acaia@127.0.0.1:5433/acaia (banco do Docker).';
    case '3D000': // database does not exist
      return 'O banco do DATABASE_URL não existe. Confira o nome no final da URL.';
    case 'ENOTFOUND':
      return 'Endereço do banco não encontrado. Confira o host do DATABASE_URL.';
    default:
      return 'Não consegui falar com o banco. Confira o DATABASE_URL e rode: npm run db:up';
  }
}
