import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createMemoryStore } from '../src/db/memory-store.js';
import { createPostgresStore } from '../src/db/postgres-store.js';
import { dbAvailable, freshDatabase } from './helpers/test-db.js';

/**
 * Each implementation provides: a store, a way to count moderation events, and cleanup.
 * @type {Record<string, { skip: boolean, setup: () => Promise<{ store: import('../src/db/store.js').Store, countModerationEvents: () => Promise<number>, close: () => Promise<void> }> }>}
 */
const implementations = {
  memory: {
    skip: false,
    async setup() {
      let tick = Date.parse('2026-12-01T12:00:00Z');
      const store = createMemoryStore({ now: () => new Date((tick += 1000)) }); // clock always moves forward
      return { store, countModerationEvents: async () => store.moderationEvents.length, close: async () => {} };
    },
  },
  postgres: {
    skip: !dbAvailable,
    async setup() {
      const pool = await freshDatabase('acaia_test_store');
      return {
        store: createPostgresStore(pool),
        countModerationEvents: async () => (await pool.query('SELECT count(*)::int AS n FROM moderation_events')).rows[0].n,
        close: () => pool.end(),
      };
    },
  },
};

for (const [name, impl] of Object.entries(implementations)) {
  describe.skipIf(impl.skip)(`Store contract: ${name}`, () => {
    /** @type {Awaited<ReturnType<typeof impl.setup>>} */
    let ctx;
    /** @type {import('../src/db/store.js').User} */
    let alice;
    /** @type {import('../src/db/store.js').User} */
    let bob;

    beforeAll(async () => {
      ctx = await impl.setup();
      alice = await ctx.store.upsertUser({ authUid: 'uid-alice', email: 'alice@example.com', displayName: 'Alice' });
      bob = await ctx.store.upsertUser({ authUid: 'uid-bob', email: 'bob@example.com' });
    });
    afterAll(() => ctx?.close());

    it('creates a user once and refreshes profile data on later logins', async () => {
      const again = await ctx.store.upsertUser({ authUid: 'uid-alice', email: 'alice@novo.com', displayName: 'Alice L.' });
      expect(again.id).toBe(alice.id);
      expect(again).toMatchObject({ authUid: 'uid-alice', email: 'alice@novo.com', displayName: 'Alice L.' });
      expect(bob.displayName).toBeNull();
    });

    it('creates, reads, renames and lists conversations per user', async () => {
      const first = await ctx.store.createConversation({ userId: alice.id });
      const second = await ctx.store.createConversation({ userId: alice.id, title: 'Estudo de SQL' });
      await ctx.store.createConversation({ userId: bob.id });

      expect(first.title).toBe('Nova conversa');
      expect(await ctx.store.getConversation(second.id, alice.id)).toMatchObject({ id: second.id, title: 'Estudo de SQL' });
      expect(await ctx.store.getConversation(second.id, bob.id)).toBeNull(); // not the owner

      await ctx.store.updateConversation(first.id, { title: 'Renomeada' });
      const list = await ctx.store.listConversations(alice.id);
      expect(list.map((c) => c.id)).toEqual([first.id, second.id]); // renamed → most recent
      expect(list[0].title).toBe('Renomeada');
    });

    it('stores messages in order with all fields and bumps the conversation', async () => {
      const conversation = await ctx.store.createConversation({ userId: alice.id });
      const other = await ctx.store.createConversation({ userId: alice.id });
      const id = '0b5c2a3e-1234-4cde-8f00-123456789abc';
      await ctx.store.addMessage({ conversationId: conversation.id, role: 'user', content: 'Oi' });
      const answer = await ctx.store.addMessage({
        id,
        conversationId: conversation.id,
        role: 'assistant',
        content: 'Olá!',
        model: 'mock',
        routeReason: 'phase0_pro_only',
        tokensIn: 12,
        tokensOut: 3,
        latencyMs: 900,
        firstTokenMs: 120,
      });

      expect(answer).toMatchObject({ id, model: 'mock', routeReason: 'phase0_pro_only', tokensIn: 12, tokensOut: 3, latencyMs: 900, firstTokenMs: 120 });
      const messages = await ctx.store.listMessages(conversation.id);
      expect(messages.map((m) => [m.role, m.content])).toEqual([
        ['user', 'Oi'],
        ['assistant', 'Olá!'],
      ]);
      expect(typeof messages[0].createdAt).toBe('string');
      expect(messages[0].tokensIn).toBeNull();

      const list = await ctx.store.listConversations(alice.id);
      expect(list.findIndex((c) => c.id === conversation.id)).toBeLessThan(list.findIndex((c) => c.id === other.id));
    });

    it('deletes only conversations the user owns, with their messages', async () => {
      const conversation = await ctx.store.createConversation({ userId: alice.id });
      await ctx.store.addMessage({ conversationId: conversation.id, role: 'user', content: 'apagar' });

      expect(await ctx.store.deleteConversation(conversation.id, bob.id)).toBe(false);
      expect(await ctx.store.deleteConversation(conversation.id, alice.id)).toBe(true);
      expect(await ctx.store.getConversation(conversation.id, alice.id)).toBeNull();
      expect(await ctx.store.listMessages(conversation.id)).toEqual([]);
      expect(await ctx.store.deleteConversation(conversation.id, alice.id)).toBe(false);
    });

    it('accumulates daily usage and sums cost across users and days', async () => {
      expect(await ctx.store.getUsage(alice.id, '2026-12-01')).toEqual({ tokensIn: 0, tokensOut: 0, costCents: 0 });
      await ctx.store.addUsage(alice.id, '2026-12-01', { tokensIn: 100, tokensOut: 50, costCents: 1.5 });
      await ctx.store.addUsage(alice.id, '2026-12-01', { tokensIn: 10, tokensOut: 5, costCents: 0.25 });
      await ctx.store.addUsage(bob.id, '2026-12-15', { tokensIn: 1, tokensOut: 1, costCents: 2 });
      await ctx.store.addUsage(bob.id, '2026-11-30', { tokensIn: 1, tokensOut: 1, costCents: 100 });

      expect(await ctx.store.getUsage(alice.id, '2026-12-01')).toEqual({ tokensIn: 110, tokensOut: 55, costCents: 1.75 });
      expect(await ctx.store.getTotalCostCents('2026-12-01', '2026-12-31')).toBeCloseTo(3.75);
    });

    it('records moderation events', async () => {
      const before = await ctx.countModerationEvents();
      await ctx.store.recordModerationEvent({ userId: alice.id, direction: 'in', category: 'violence', action: 'blocked' });
      expect(await ctx.countModerationEvents()).toBe(before + 1);
    });
  });
}
