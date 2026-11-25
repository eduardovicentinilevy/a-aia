import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Minimal, dependency-free SQL migration runner.
 *
 * - Files live in apps/api/migrations and are named NNNN_description.sql (e.g. 0001_initial.sql).
 * - Each file has two sections, marked by the lines `-- migrate:up` and `-- migrate:down`.
 * - Applied migrations are recorded in the table schema_migrations.
 * - Each migration runs inside a transaction: it is applied completely or not at all.
 * - A PostgreSQL advisory lock stops two processes (e.g. two deploys) from migrating at once.
 */

export const MIGRATIONS_DIR = new URL('../../migrations/', import.meta.url);

/** Arbitrary constant that identifies "the AçaIA migration lock" in pg_advisory_lock. */
const LOCK_KEY = 7_216_514_201;
const FILE_PATTERN = /^\d{4}_[a-z0-9_-]+\.sql$/;

/**
 * @typedef {{ name: string, up: string, down: string }} Migration
 */

/**
 * Reads and parses every migration file in `dir`, sorted by name.
 * @param {string|URL} dir
 * @returns {Migration[]}
 */
export function loadMigrations(dir = MIGRATIONS_DIR) {
  const path = dir instanceof URL ? fileURLToPath(dir) : dir;
  return readdirSync(path)
    .filter((file) => FILE_PATTERN.test(file))
    .sort()
    .map((file) => parseMigration(file, readFileSync(join(path, file), 'utf8')));
}

/**
 * Splits a migration file into its up and down SQL.
 * @param {string} name
 * @param {string} source
 * @returns {Migration}
 */
export function parseMigration(name, source) {
  const upMarker = source.search(/^-- migrate:up\s*$/m);
  const downMarker = source.search(/^-- migrate:down\s*$/m);
  if (upMarker === -1 || downMarker === -1 || downMarker < upMarker) {
    throw new Error(`${name}: needs a "-- migrate:up" section followed by a "-- migrate:down" section`);
  }
  const up = source.slice(upMarker, downMarker).replace(/^-- migrate:up\s*$/m, '').trim();
  const down = source.slice(downMarker).replace(/^-- migrate:down\s*$/m, '').trim();
  if (!up) throw new Error(`${name}: the "-- migrate:up" section is empty`);
  return { name, up, down };
}

/**
 * Applies pending migrations (up) or reverts the latest ones (down).
 * @param {import('pg').Pool} pool
 * @param {object} [options]
 * @param {'up'|'down'} [options.direction]
 * @param {number} [options.steps]  How many to apply/revert. Default: all pending (up) or 1 (down).
 * @param {Migration[]} [options.migrations]
 * @param {(message: string) => void} [options.log]
 * @returns {Promise<string[]>} Names of the migrations applied or reverted.
 */
export async function migrate(pool, { direction = 'up', steps, migrations = loadMigrations(), log = () => {} } = {}) {
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [LOCK_KEY]);
    await client.query(
      'CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())',
    );
    const { rows } = await client.query('SELECT name FROM schema_migrations ORDER BY name');
    const applied = rows.map((row) => row.name);
    const known = new Set(migrations.map((m) => m.name));

    const missing = applied.filter((name) => !known.has(name));
    if (missing.length > 0) {
      throw new Error(`Applied migrations not found on disk: ${missing.join(', ')}`);
    }

    const done = [];
    if (direction === 'up') {
      const lastApplied = applied.at(-1) ?? '';
      const pending = migrations.filter((m) => !applied.includes(m.name));
      const outOfOrder = pending.filter((m) => m.name < lastApplied);
      if (outOfOrder.length > 0) {
        throw new Error(`Migrations older than ${lastApplied} were never applied: ${outOfOrder.map((m) => m.name).join(', ')}`);
      }
      for (const migration of pending.slice(0, steps ?? pending.length)) {
        await runInTransaction(client, migration.up, migration.name, () =>
          client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [migration.name]),
        );
        log(`↑ ${migration.name}`);
        done.push(migration.name);
      }
    } else {
      const toRevert = applied.slice(-(steps ?? 1)).reverse();
      for (const name of toRevert) {
        const migration = /** @type {Migration} */ (migrations.find((m) => m.name === name));
        await runInTransaction(client, migration.down, name, () =>
          client.query('DELETE FROM schema_migrations WHERE name = $1', [name]),
        );
        log(`↓ ${name}`);
        done.push(name);
      }
    }
    return done;
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [LOCK_KEY]).catch(() => {});
    client.release();
  }
}

/**
 * Lists migrations that exist on disk but are not applied yet (never throws).
 * @param {import('pg').Pool} pool
 * @param {Migration[]} [migrations]
 * @returns {Promise<string[]|null>} null when the check itself failed (e.g. database down).
 */
export async function pendingMigrations(pool, migrations = loadMigrations()) {
  try {
    const { rows } = await pool.query('SELECT name FROM schema_migrations');
    const applied = new Set(rows.map((row) => row.name));
    return migrations.map((m) => m.name).filter((name) => !applied.has(name));
  } catch (err) {
    // 42P01 = table does not exist yet: nothing was ever applied.
    if (/** @type {any} */ (err)?.code === '42P01') return migrations.map((m) => m.name);
    return null;
  }
}

/**
 * @param {import('pg').PoolClient} client
 * @param {string} sql
 * @param {string} name
 * @param {() => Promise<unknown>} record
 */
async function runInTransaction(client, sql, name, record) {
  try {
    await client.query('BEGIN');
    await client.query(sql);
    await record();
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    const message = /** @type {Error} */ (err).message;
    throw Object.assign(new Error(`Migration ${name} failed: ${message}`), { cause: err });
  }
}
