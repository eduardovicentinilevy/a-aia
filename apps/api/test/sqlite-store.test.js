import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createSqliteStore, openSqliteDatabase } from '../src/db/sqlite-store.js';

/** @type {string[]} */
const dirs = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('SQLite store (desktop)', () => {
  it('keeps the data in a file across restarts and creates missing folders', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'acaia-sqlite-'));
    dirs.push(dir);
    const file = join(dir, 'sub', 'acaia.db');

    const first = createSqliteStore(openSqliteDatabase(file));
    const user = await first.upsertUser({ authUid: 'local' });
    const conversation = await first.createConversation({ userId: user.id, title: 'Guardada' });
    await first.addMessage({ conversationId: conversation.id, role: 'user', content: 'Oi' });
    first.close();

    const second = createSqliteStore(openSqliteDatabase(file));
    const again = await second.upsertUser({ authUid: 'local' });
    expect(again.id).toBe(user.id);
    expect((await second.listConversations(user.id)).map((c) => c.title)).toEqual(['Guardada']);
    expect((await second.listMessages(conversation.id)).map((m) => m.content)).toEqual(['Oi']);
    second.close();
  });

  it('sets the schema version, so future migrations know where to start', () => {
    const db = openSqliteDatabase(':memory:');
    expect(/** @type {any} */ (db.prepare('PRAGMA user_version').get()).user_version).toBe(1);
    expect(/** @type {any} */ (db.prepare('PRAGMA foreign_keys').get()).foreign_keys).toBe(1);
    db.close();
  });

  it('refuses a message for a conversation that does not exist', async () => {
    const store = createSqliteStore(openSqliteDatabase(':memory:'));
    await expect(store.addMessage({ conversationId: 'missing', role: 'user', content: 'x' })).rejects.toThrow();
    store.close();
  });
});
