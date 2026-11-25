// Helpers for tests that need a real PostgreSQL.
//
// By default they use the docker compose database (`npm run db:up`). Each test file
// creates its own database (acaia_test_<something>), so files can run in parallel and
// your development data is never touched.
//
// - Database down → those tests are SKIPPED (with a warning), so `npm test` still works offline.
// - REQUIRE_TEST_DB=1 (set in CI) → a missing database FAILS the run instead.
import pg from 'pg';
import { migrate } from '../../src/db/migrate.js';

const SERVER_URL = process.env.TEST_DATABASE_URL ?? 'postgres://acaia:acaia@localhost:5432/acaia';

/** @param {string} url @param {string} database */
function withDatabase(url, database) {
  const parsed = new URL(url);
  parsed.pathname = `/${database}`;
  return parsed.toString();
}

async function canConnect() {
  const client = new pg.Client({ connectionString: withDatabase(SERVER_URL, 'postgres'), connectionTimeoutMillis: 1500 });
  try {
    await client.connect();
    return true;
  } catch {
    return false;
  } finally {
    await client.end().catch(() => {});
  }
}

export const dbAvailable = await canConnect();

if (!dbAvailable) {
  if (process.env.REQUIRE_TEST_DB) throw new Error(`REQUIRE_TEST_DB is set but no database answers at ${new URL(SERVER_URL).host}`);
  console.warn('[testes] PostgreSQL indisponível: testes de banco foram pulados. Rode `npm run db:up` para incluí-los.');
}

/**
 * Drops and recreates a test database, optionally applying all migrations.
 * @param {string} name  Lowercase letters, digits and underscores, starting with "acaia_test_".
 * @param {{ migrated?: boolean }} [options]
 */
export async function freshDatabase(name, { migrated = true } = {}) {
  if (!/^acaia_test_[a-z0-9_]+$/.test(name)) throw new Error(`Invalid test database name: ${name}`);
  const admin = new pg.Client({ connectionString: withDatabase(SERVER_URL, 'postgres') });
  await admin.connect();
  try {
    await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${name}`);
  } finally {
    await admin.end();
  }
  const pool = new pg.Pool({ connectionString: withDatabase(SERVER_URL, name), max: 5 });
  if (migrated) await migrate(pool);
  return pool;
}
