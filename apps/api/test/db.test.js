import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { checkDatabase, createPool, databaseHint } from '../src/db/pool.js';
import { silentLogger } from '../src/lib/logger.js';
import { dbAvailable, freshDatabase } from './helpers/test-db.js';

describe('checkDatabase', () => {
  it('reports not_configured without a pool', async () => {
    expect(await checkDatabase(null)).toEqual({ ok: false, error: 'not_configured' });
  });

  it('reports an error (and does not throw) when the database is unreachable', async () => {
    const pool = createPool('postgres://acaia:acaia@127.0.0.1:1/acaia', silentLogger);
    const status = await checkDatabase(pool);
    expect(status.ok).toBe(false);
    await pool.end();
  });
});

describe('databaseHint', () => {
  it('explains the "role does not exist" case (another PostgreSQL on the machine)', () => {
    expect(databaseHint('28000')).toContain('127.0.0.1:25432');
    expect(databaseHint('ECONNREFUSED')).toContain('npm run db:up');
    expect(databaseHint('XX999')).toContain('DATABASE_URL');
  });
});

describe.skipIf(!dbAvailable)('checkDatabase against a real PostgreSQL', () => {
  /** @type {import('pg').Pool} */
  let pool;
  beforeAll(async () => {
    pool = await freshDatabase('acaia_test_health', { migrated: false });
  });
  afterAll(() => pool?.end());

  it('connects and finds the pgvector extension', async () => {
    expect(await checkDatabase(pool)).toEqual({ ok: true, pgvector: true });
  });
});
