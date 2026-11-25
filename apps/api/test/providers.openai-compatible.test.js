import { createServer } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { createOpenAICompatibleProvider } from '../src/providers/model/openai-compatible.js';

/**
 * Starts a throwaway HTTP server that plays the role of the model provider.
 * @param {(req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse, body: any) => void} handler
 */
async function startFakeProvider(handler) {
  const requests = [];
  const server = createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk) => (raw += chunk));
    req.on('end', () => {
      const body = raw ? JSON.parse(raw) : undefined;
      requests.push({ method: req.method, url: req.url, headers: req.headers, body });
      handler(req, res, body);
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(undefined)));
  const { port } = /** @type {import('node:net').AddressInfo} */ (server.address());
  servers.push(server);
  return { baseUrl: `http://127.0.0.1:${port}/v1`, requests };
}

/** @type {import('node:http').Server[]} */
const servers = [];
afterEach(() => {
  for (const server of servers.splice(0)) server.closeAllConnections?.(), server.close();
});

/** @param {unknown} payload */
const sse = (payload) => `data: ${typeof payload === 'string' ? payload : JSON.stringify(payload)}\n\n`;
const delta = (content, extra = {}) => ({ choices: [{ index: 0, delta: { content }, ...extra }] });

/** @param {AsyncIterable<any>} iterable */
async function collect(iterable) {
  const out = [];
  for await (const item of iterable) out.push(item);
  return out;
}

const messages = [
  { role: /** @type {const} */ ('system'), content: 'Você é a AçaIA.' },
  { role: /** @type {const} */ ('user'), content: 'Oi!' },
];

describe('OpenAI-compatible provider', () => {
  it('sends the right request and streams tokens, usage and finish reason', async () => {
    const fake = await startFakeProvider((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      // Split one event across two writes to exercise the parser.
      res.write('data: {"choices":[{"delta":{"role":"assistant","content":""}}]}\n\nda');
      res.write(`ta: ${JSON.stringify(delta('Olá'))}\n\n`);
      res.write(sse(delta(', Eduardo!', { finish_reason: 'stop' })));
      res.write(sse({ choices: [], usage: { prompt_tokens: 12, completion_tokens: 3 } }));
      res.end(sse('[DONE]'));
    });
    const provider = createOpenAICompatibleProvider({ name: 'pro', baseUrl: `${fake.baseUrl}/`, apiKey: 'test-key', model: 'm1' });

    const events = await collect(provider.stream({ messages, maxTokens: 64, temperature: 0.3 }));

    expect(events).toEqual([
      { type: 'token', text: 'Olá' },
      { type: 'token', text: ', Eduardo!' },
      { type: 'done', usage: { tokensIn: 12, tokensOut: 3 }, finishReason: 'stop' },
    ]);
    const [request] = fake.requests;
    expect(request.url).toBe('/v1/chat/completions');
    expect(request.headers.authorization).toBe('Bearer test-key');
    expect(request.body).toEqual({ model: 'm1', messages, stream: true, max_tokens: 64, temperature: 0.3 });
  });

  it('turns HTTP errors into ProviderError with status and a log-only detail', async () => {
    const fake = await startFakeProvider((_req, res) => {
      res.writeHead(429, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify([{ error: { code: 429, message: 'Quota exceeded' } }]));
    });
    const provider = createOpenAICompatibleProvider({ name: 'pro', baseUrl: fake.baseUrl, apiKey: 'k', model: 'm' });
    await expect(collect(provider.stream({ messages, maxTokens: 10 }))).rejects.toMatchObject({
      name: 'ProviderError',
      code: 'http_error',
      status: 429,
      detail: 'Quota exceeded',
    });
  });

  it('times out when the first chunk takes too long', async () => {
    const fake = await startFakeProvider(() => {
      /* never answers */
    });
    const provider = createOpenAICompatibleProvider({ name: 'pro', baseUrl: fake.baseUrl, apiKey: 'k', model: 'm', timeoutMs: 100 });
    await expect(collect(provider.stream({ messages, maxTokens: 10 }))).rejects.toMatchObject({ code: 'timeout' });
  });

  it('reports "aborted" and cancels the request when the caller aborts mid-stream', async () => {
    let clientClosed = false;
    const fake = await startFakeProvider((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.write(sse(delta('primeiro ')));
      res.on('close', () => (clientClosed = true));
      // ...then hangs, like a slow model.
    });
    const provider = createOpenAICompatibleProvider({ name: 'pro', baseUrl: fake.baseUrl, apiKey: 'k', model: 'm' });
    const controller = new AbortController();
    const seen = [];
    await expect(async () => {
      for await (const event of provider.stream({ messages, maxTokens: 10, signal: controller.signal })) {
        seen.push(event);
        controller.abort();
      }
    }).rejects.toMatchObject({ code: 'aborted' });
    expect(seen).toEqual([{ type: 'token', text: 'primeiro ' }]);
    await expect.poll(() => clientClosed).toBe(true);
  });

  it('reports a network error when the provider is unreachable', async () => {
    const provider = createOpenAICompatibleProvider({ name: 'pro', baseUrl: 'http://127.0.0.1:1/v1', apiKey: 'k', model: 'm' });
    await expect(collect(provider.stream({ messages, maxTokens: 10 }))).rejects.toMatchObject({ code: 'network' });
  });

  it('rejects invalid JSON chunks', async () => {
    const fake = await startFakeProvider((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.end(sse('not json'));
    });
    const provider = createOpenAICompatibleProvider({ name: 'pro', baseUrl: fake.baseUrl, apiKey: 'k', model: 'm' });
    await expect(collect(provider.stream({ messages, maxTokens: 10 }))).rejects.toMatchObject({ code: 'bad_response' });
  });
});
