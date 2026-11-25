import { afterAll, describe, expect, it } from 'vitest';
import { checkDatabase, createPool } from '../src/db/pool.js';
import { silentLogger } from '../src/lib/logger.js';

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

// Runs only when a real database is available (e.g. after `npm run db:up`):
//   TEST_DATABASE_URL=postgres://acaia:acaia@localhost:5432/acaia npm test
const databaseUrl = process.env.TEST_DATABASE_URL;

describe.skipIf(!databaseUrl)('checkDatabase against the docker compose database', () => {
  const pool = databaseUrl ? createPool(databaseUrl, silentLogger) : null;
  afterAll(() => pool?.end());

  it('connects and finds the pgvector extension', async () => {
    expect(await checkDatabase(pool)).toEqual({ ok: true, pgvector: true });
  });
});
