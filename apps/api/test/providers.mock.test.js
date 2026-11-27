import { describe, expect, it } from 'vitest';
import { ProviderError } from '../src/providers/errors.js';
import { createMockProvider } from '../src/providers/model/mock.js';

const messages = [{ role: /** @type {const} */ ('user'), content: 'Oi, tudo bem?' }];

/** @param {AsyncIterable<any>} iterable */
async function collect(iterable) {
  const out = [];
  for await (const item of iterable) out.push(item);
  return out;
}

describe('MockProvider', () => {
  it('streams the reply word by word and ends with usage', async () => {
    const provider = createMockProvider({ reply: 'Olá, tudo ótimo!', delayMs: 0 });
    const events = await collect(provider.stream({ messages, maxTokens: 100 }));
    const text = events.filter((e) => e.type === 'token').map((e) => e.text).join('');
    expect(text).toBe('Olá, tudo ótimo!');
    expect(events.at(-1)).toEqual({ type: 'done', usage: { tokensIn: 4, tokensOut: 3 }, finishReason: 'stop' });
  });

  it('echoes the user message in the default reply', async () => {
    const provider = createMockProvider({ delayMs: 0 });
    const events = await collect(provider.stream({ messages, maxTokens: 500 }));
    const text = events.filter((e) => e.type === 'token').map((e) => e.text).join('');
    expect(text).toContain('modo de teste');
    expect(text).toContain('Oi, tudo bem?');
  });

  it('respects maxTokens', async () => {
    const provider = createMockProvider({ reply: 'um dois três quatro', delayMs: 0 });
    const events = await collect(provider.stream({ messages, maxTokens: 2 }));
    expect(events.filter((e) => e.type === 'token')).toHaveLength(2);
  });

  it('stops with an "aborted" error when the signal fires', async () => {
    const controller = new AbortController();
    const provider = createMockProvider({ reply: 'a b c d e f g h', delayMs: 5 });
    const seen = [];
    await expect(async () => {
      for await (const event of provider.stream({ messages, maxTokens: 100, signal: controller.signal })) {
        seen.push(event);
        if (seen.length === 2) controller.abort();
      }
    }).rejects.toMatchObject({ code: 'aborted' });
    expect(seen).toHaveLength(2);
  });

  it('can simulate a failure after N tokens', async () => {
    const error = new ProviderError('boom', { code: 'network' });
    const provider = createMockProvider({ reply: 'a b c', delayMs: 0, fail: { afterTokens: 1, error } });
    await expect(collect(provider.stream({ messages, maxTokens: 100 }))).rejects.toBe(error);
  });

  it('gives a "Humanizar" text back unchanged, saying it is a test', async () => {
    const provider = createMockProvider({ delayMs: 0 });
    const messages = [
      { role: 'system', content: 'S' },
      { role: 'user', content: 'Tom: natural.\n\n<texto_original>\nEm suma, tudo certo.\n</texto_original>' },
    ];
    let text = '';
    for await (const event of provider.stream({ messages, maxTokens: 500 })) if (event.type === 'token') text += event.text;
    expect(text).toMatch(/^\(Modo de teste/);
    expect(text.endsWith('Em suma, tudo certo.')).toBe(true);
  });
});
