import { describe, expect, it } from 'vitest';
import { CONNECTION_LOST_MESSAGE, chatReducer, initialChatState } from '../src/lib/chat-reducer.js';

/** @param {import('../src/lib/chat-reducer.js').ChatAction[]} actions */
const run = (actions, state = initialChatState) => actions.reduce(chatReducer, state);
const send = (content = 'Oi', userId = 'u1', assistantId = 'a1') => /** @type {const} */ ({ type: 'send', userId, assistantId, content });
const event = (name, data, id = 'a1') => /** @type {const} */ ({ type: 'event', id, event: name, data });

describe('chatReducer', () => {
  it('adds the user message and an empty streaming answer on send', () => {
    const state = run([send('Olá!')]);
    expect(state.streamingId).toBe('a1');
    expect(state.messages).toEqual([
      { id: 'u1', role: 'user', text: 'Olá!', status: 'done' },
      { id: 'a1', role: 'assistant', text: '', status: 'streaming', meta: null, stats: null, error: null },
    ]);
  });

  it('builds the answer from meta, tokens and done', () => {
    const state = run([
      send(),
      event('meta', { tier: 'pro', model: 'mock', routeReason: 'phase0_pro_only' }),
      event('token', { text: 'Oi, ' }),
      event('token', { text: 'tudo bem?' }),
      event('done', { firstTokenMs: 120, latencyMs: 900 }),
      { type: 'finished', id: 'a1' },
    ]);
    expect(state.streamingId).toBeNull();
    expect(state.messages[1]).toMatchObject({
      text: 'Oi, tudo bem?',
      status: 'done',
      meta: { tier: 'pro', model: 'mock', routeReason: 'phase0_pro_only' },
      stats: { firstTokenMs: 120, latencyMs: 900 },
      error: null,
    });
  });

  it('keeps partial text and shows the error event message', () => {
    const state = run([send(), event('token', { text: 'Começo' }), event('error', { message: 'Limite atingido.' })]);
    expect(state.messages[1]).toMatchObject({ text: 'Começo', status: 'error', error: 'Limite atingido.' });
  });

  it('marks a request failure (e.g. API offline) as an error', () => {
    const state = run([send(), { type: 'failed', id: 'a1', message: 'API fora do ar' }, { type: 'finished', id: 'a1' }]);
    expect(state.messages[1]).toMatchObject({ status: 'error', error: 'API fora do ar' });
    expect(state.streamingId).toBeNull();
  });

  it('marks an answer as stopped only while it is streaming', () => {
    const stopped = run([send(), event('token', { text: 'a' }), { type: 'stopped', id: 'a1' }]);
    expect(stopped.messages[1].status).toBe('stopped');

    const done = run([send(), event('done', {})]);
    expect(chatReducer(done, { type: 'stopped', id: 'a1' })).toBe(done);
  });

  it('reports a lost connection when the stream ends without done or error', () => {
    const state = run([send(), event('token', { text: 'a' }), { type: 'finished', id: 'a1' }]);
    expect(state.messages[1]).toMatchObject({ status: 'error', error: CONNECTION_LOST_MESSAGE });
  });

  it('ignores a late "finished" from an older request', () => {
    const state = run([send('primeira', 'u1', 'a1'), { type: 'reset' }, send('segunda', 'u2', 'a2'), { type: 'finished', id: 'a1' }]);
    expect(state.streamingId).toBe('a2');
    expect(state.messages.map((m) => m.id)).toEqual(['u2', 'a2']);
  });

  it('returns the same state for unknown messages or events', () => {
    const state = run([send()]);
    expect(chatReducer(state, event('token', { text: 'x' }, 'nope'))).toBe(state);
    expect(chatReducer(state, event('sources', { items: [] }))).toBe(state);
  });

  it('only replaces the message that changed (keeps the others for React.memo)', () => {
    const before = run([send()]);
    const after = chatReducer(before, event('token', { text: 'x' }));
    expect(after.messages[0]).toBe(before.messages[0]);
    expect(after.messages[1]).not.toBe(before.messages[1]);
  });

  it('clears everything on reset', () => {
    expect(run([send(), { type: 'reset' }])).toBe(initialChatState);
  });
});
