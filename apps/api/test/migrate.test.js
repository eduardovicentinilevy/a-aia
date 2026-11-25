import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadMigrations, migrate, parseMigration, pendingMigrations } from '../src/db/migrate.js';
import { dbAvailable, freshDatabase } from './helpers/test-db.js';

describe('parseMigration', () => {
  it('splits up and down sections', () => {
    const migration = parseMigration('0001_x.sql', '-- comment\n-- migrate:up\nCREATE TABLE a();\n-- migrate:down\nDROP TABLE a;\n');
    expect(migration).toEqual({ name: '0001_x.sql', up: 'CREATE TABLE a();', down: 'DROP TABLE a;' });
  });

  it('rejects files without both markers or with an empty up section', () => {
    expect(() => parseMigration('0001_x.sql', 'CREATE TABLE a();')).toThrow(/migrate:up/);
    expect(() => parseMigration('0001_x.sql', '-- migrate:down\nx\n-- migrate:up\ny')).toThrow(/migrate:up/);
    expect(() => parseMigration('0001_x.sql', '-- migrate:up\n\n-- migrate:down\nDROP TABLE a;')).toThrow(/empty/);
  });

  it('loads the real migration files in order', () => {
    const names = loadMigrations().map((m) => m.name);
    expect(names).toEqual([...names].sort());
    expect(names[0]).toBe('0001_users_conversations_messages.sql');
  });
});

const fake = (name, up, down = '') => ({ name, up, down });

describe.skipIf(!dbAvailable)('migrate (real PostgreSQL)', () => {
  /** @type {import('pg').Pool} */
  let pool;
  beforeAll(async () => {
    pool = await freshDatabase('acaia_test_migrate', { migrated: false });
  });
  afterAll(() => pool?.end());

  it('applies every migration once, in order, and records it', async () => {
    const all = loadMigrations().map((m) => m.name);
    expect(await pendingMigrations(pool)).toEqual(all);

    expect(await migrate(pool)).toEqual(all);
    expect(await migrate(pool)).toEqual([]); // second run: nothing to do
    expect(await pendingMigrations(pool)).toEqual([]);

    const { rows } = await pool.query("SELECT extname FROM pg_extension WHERE extname = 'vector'");
    expect(rows).toHaveLength(1);
  });

  it('reverts the latest migration and can apply it again', async () => {
    const all = loadMigrations().map((m) => m.name);
    expect(await migrate(pool, { direction: 'down' })).toEqual([all.at(-1)]);
    expect(await pendingMigrations(pool)).toEqual([all.at(-1)]);
    expect(await migrate(pool)).toEqual([all.at(-1)]);
  });

  it('enforces the schema rules: cascade on user delete and valid roles', async () => {
    const { rows: [user] } = await pool.query("INSERT INTO users (auth_uid, email) VALUES ('uid-1', 'a@b.co') RETURNING id");
    const { rows: [conversation] } = await pool.query('INSERT INTO conversations (user_id) VALUES ($1) RETURNING id, title', [user.id]);
    expect(conversation.title).toBe('Nova conversa');
    await pool.query("INSERT INTO messages (conversation_id, role, content) VALUES ($1, 'user', 'oi')", [conversation.id]);
    await pool.query("INSERT INTO usage_daily (user_id, day, tokens_in) VALUES ($1, current_date, 10)", [user.id]);
    await expect(
      pool.query("INSERT INTO messages (conversation_id, role, content) VALUES ($1, 'robot', 'x')", [conversation.id]),
    ).rejects.toMatchObject({ code: '23514' }); // check_violation

    await pool.query('DELETE FROM users WHERE id = $1', [user.id]);
    const counts = await pool.query(
      'SELECT (SELECT count(*) FROM conversations)::int AS c, (SELECT count(*) FROM messages)::int AS m, (SELECT count(*) FROM usage_daily)::int AS u',
    );
    expect(counts.rows[0]).toEqual({ c: 0, m: 0, u: 0 });
  });
});

describe.skipIf(!dbAvailable)('migrate safety (real PostgreSQL)', () => {
  /** @type {import('pg').Pool} */
  let pool;
  beforeAll(async () => {
    pool = await freshDatabase('acaia_test_migrate_safety', { migrated: false });
  });
  afterAll(() => pool?.end());

  it('rolls back a failing migration completely', async () => {
    const migrations = [fake('0001_ok.sql', 'CREATE TABLE t1 (x int)'), fake('0002_bad.sql', 'CREATE TABLE t2 (x int); SELECT no_such_column;')];
    await expect(migrate(pool, { migrations })).rejects.toThrow(/0002_bad\.sql failed/);
    const { rows } = await pool.query("SELECT to_regclass('t1') AS t1, to_regclass('t2') AS t2");
    expect(rows[0]).toEqual({ t1: 't1', t2: null }); // 0001 kept, 0002 fully undone
    expect(await pendingMigrations(pool, migrations)).toEqual(['0002_bad.sql']);
  });

  it('refuses migrations that are older than the last applied one', async () => {
    const migrations = [fake('0000_late.sql', 'SELECT 1'), fake('0001_ok.sql', 'CREATE TABLE t1 (x int)')];
    await expect(migrate(pool, { migrations })).rejects.toThrow(/never applied: 0000_late\.sql/);
  });

  it('refuses to run when an applied migration file is missing', async () => {
    await expect(migrate(pool, { migrations: [] })).rejects.toThrow(/not found on disk: 0001_ok\.sql/);
  });
});
