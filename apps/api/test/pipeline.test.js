import { describe, expect, it } from 'vitest';
import { createMemoryStore } from '../src/db/memory-store.js';
import { silentLogger } from '../src/lib/logger.js';
import { buildContext } from '../src/orchestrator/context.js';
import { createChatPipeline, ROUTE_REASON_PHASE0 } from '../src/orchestrator/pipeline.js';
import { ProviderError } from '../src/providers/errors.js';
import { createMockProvider } from '../src/providers/model/mock.js';

/** @param {Partial<Parameters<typeof createChatPipeline>[0]>} [overrides] */
async function setup(overrides = {}) {
  const store = createMemoryStore();
  const proProvider = overrides.proProvider ?? createMockProvider({ name: 'pro', model: 'mock', reply: 'Oi, eu sou a AçaIA!', delayMs: 0 });
  let tick = 0;
  const pipeline = createChatPipeline({
    store,
    proProvider,
    systemPrompt: 'SYSTEM',
    promptVersion: 'v1',
    maxOutputTokens: 256,
    logger: silentLogger,
    clock: () => (tick += 10), // deterministic fake clock
    ...overrides,
  });
  const conversation = await store.createConversation({ userId: 'u1' });
  /** @type {{ event: string, data: any }[]} */
  const events = [];
  const emit = (event, data) => events.push({ event, data });
  return { store, pipeline, conversation, events, emit, proProvider };
}

describe('buildContext', () => {
  it('puts the system prompt first and keeps only the most recent messages', () => {
    const history = Array.from({ length: 30 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: `m${i}` }));
    const context = buildContext({ systemPrompt: 'S', history, maxHistoryMessages: 4 });
    expect(context).toEqual([
      { role: 'system', content: 'S' },
      { role: 'user', content: 'm26' },
      { role: 'assistant', content: 'm27' },
      { role: 'user', content: 'm28' },
      { role: 'assistant', content: 'm29' },
    ]);
  });
});

describe('chat pipeline', () => {
  it('emits meta → tokens → done and persists both messages', async () => {
    const { store, pipeline, conversation, events, emit } = await setup();

    const result = await pipeline.handleMessage({ conversation, content: 'Olá!', emit });

    expect(result).toEqual({ status: 'done' });
    expect(events[0]).toMatchObject({
      event: 'meta',
      data: { conversationId: conversation.id, tier: 'pro', model: 'mock', routeReason: ROUTE_REASON_PHASE0, promptVersion: 'v1' },
    });
    const text = events.filter((e) => e.event === 'token').map((e) => e.data.text).join('');
    expect(text).toBe('Oi, eu sou a AçaIA!');
    const done = events.at(-1);
    expect(done?.event).toBe('done');
    expect(done?.data.messageId).toBe(events[0].data.messageId);

    const saved = await store.listMessages(conversation.id);
    expect(saved.map((m) => [m.role, m.content])).toEqual([
      ['user', 'Olá!'],
      ['assistant', 'Oi, eu sou a AçaIA!'],
    ]);
    expect(saved[1]).toMatchObject({ model: 'mock', routeReason: ROUTE_REASON_PHASE0, tokensOut: 5 });
    expect(saved[1].firstTokenMs).toBeGreaterThan(0);
    expect(saved[1].latencyMs).toBeGreaterThanOrEqual(/** @type {number} */ (saved[1].firstTokenMs));
  });

  it('names the conversation after the first message', async () => {
    const { store, pipeline, conversation, emit } = await setup();
    await pipeline.handleMessage({ conversation, content: 'Como funciona o pgvector?', emit });
    expect((await store.getConversation(conversation.id, 'u1'))?.title).toBe('Como funciona o pgvector?');
  });

  it('sends the system prompt and the history to the model', async () => {
    /** @type {any[]} */
    const seen = [];
    const proProvider = createMockProvider({ name: 'pro', delayMs: 0, reply: (messages) => (seen.push(messages), 'ok') });
    const { pipeline, conversation, emit } = await setup({ proProvider });
    await pipeline.handleMessage({ conversation, content: 'primeira', emit });
    await pipeline.handleMessage({ conversation, content: 'segunda', emit });
    expect(seen[1]).toEqual([
      { role: 'system', content: 'SYSTEM' },
      { role: 'user', content: 'primeira' },
      { role: 'assistant', content: 'ok' },
      { role: 'user', content: 'segunda' },
    ]);
  });

  it('emits a friendly error and does not persist an answer when the model fails', async () => {
    const proProvider = createMockProvider({
      name: 'pro',
      delayMs: 0,
      reply: 'a b c',
      fail: { afterTokens: 1, error: new ProviderError('quota', { code: 'http_error', status: 429 }) },
    });
    const { store, pipeline, conversation, events, emit } = await setup({ proProvider });

    const result = await pipeline.handleMessage({ conversation, content: 'Oi', emit });

    expect(result).toEqual({ status: 'error' });
    expect(events.at(-1)).toEqual({
      event: 'error',
      data: { code: 'http_error', message: 'O limite de uso do modelo foi atingido. Espere um pouco e tente de novo.' },
    });
    const saved = await store.listMessages(conversation.id);
    expect(saved.map((m) => m.role)).toEqual(['user']);
  });

  it('keeps the partial answer when the client aborts', async () => {
    const controller = new AbortController();
    const proProvider = createMockProvider({ name: 'pro', reply: 'um dois três quatro cinco', delayMs: 5 });
    const { store, pipeline, conversation, events } = await setup({ proProvider });
    const emit = (event, data) => {
      events.push({ event, data });
      if (events.filter((e) => e.event === 'token').length === 2) controller.abort();
    };

    const result = await pipeline.handleMessage({ conversation, content: 'Oi', emit, signal: controller.signal });

    expect(result).toEqual({ status: 'aborted' });
    expect(events.some((e) => e.event === 'done' || e.event === 'error')).toBe(false);
    const saved = await store.listMessages(conversation.id);
    expect(saved.at(-1)).toMatchObject({ role: 'assistant', content: 'um dois ' });
  });
});
