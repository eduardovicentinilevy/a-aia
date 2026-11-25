import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { createMemoryStore } from '../src/db/memory-store.js';
import { silentLogger } from '../src/lib/logger.js';
import { createChatPipeline } from '../src/orchestrator/pipeline.js';
import { createMockProvider } from '../src/providers/model/mock.js';

/** @param {{ checkDb?: () => Promise<any>, proProvider?: any }} [options] */
function buildApp({ checkDb = async () => ({ ok: true, pgvector: true }), proProvider } = {}) {
  const store = createMemoryStore();
  const pipeline = createChatPipeline({
    store,
    proProvider: proProvider ?? createMockProvider({ name: 'pro', model: 'mock', reply: 'Oi! Tudo certo.', delayMs: 0 }),
    systemPrompt: 'SYSTEM',
    promptVersion: 'v1',
    maxOutputTokens: 256,
    logger: silentLogger,
  });
  const app = createApp({
    config: { corsOrigins: ['http://localhost:5173'] },
    logger: silentLogger,
    store,
    pipeline,
    checkDb,
    version: '0.0.0-test',
  });
  return { app, store };
}

/** Collects the raw SSE body as text (supertest does not buffer event streams by default). */
const asText = (res, callback) => {
  let data = '';
  res.setEncoding('utf8');
  res.on('data', (chunk) => (data += chunk));
  res.on('end', () => callback(null, data));
};

/** @param {string} body */
function parseEvents(body) {
  return body
    .split('\n\n')
    .filter(Boolean)
    .map((block) => {
      const event = /^event: (.*)$/m.exec(block)?.[1];
      const data = /^data: (.*)$/m.exec(block)?.[1];
      return { event, data: data ? JSON.parse(data) : undefined };
    });
}

describe('GET /health', () => {
  it('reports ok when the database answers', async () => {
    const { app } = buildApp();
    const res = await request(app).get('/health').expect(200);
    expect(res.body).toMatchObject({ status: 'ok', version: '0.0.0-test', checks: { db: { ok: true, pgvector: true } } });
  });

  it('reports degraded (still 200) when the database is down', async () => {
    const { app } = buildApp({ checkDb: async () => ({ ok: false, error: 'ECONNREFUSED' }) });
    const res = await request(app).get('/health').expect(200);
    expect(res.body.status).toBe('degraded');
  });

  it('sends security headers', async () => {
    const { app } = buildApp();
    const res = await request(app).get('/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});

describe('CORS', () => {
  it('allows the configured origin only', async () => {
    const { app } = buildApp();
    const allowed = await request(app).get('/health').set('Origin', 'http://localhost:5173');
    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    const denied = await request(app).get('/health').set('Origin', 'https://evil.example');
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('conversations', () => {
  it('creates and lists conversations', async () => {
    const { app } = buildApp();
    const created = await request(app).post('/conversations').send({}).expect(201);
    expect(created.body).toMatchObject({ title: 'Nova conversa', userId: 'local-dev' });
    const list = await request(app).get('/conversations').expect(200);
    expect(list.body.conversations.map((c) => c.id)).toEqual([created.body.id]);
  });

  it('rejects unknown fields', async () => {
    const { app } = buildApp();
    const res = await request(app).post('/conversations').send({ title: 'x', admin: true }).expect(400);
    expect(res.body.error.code).toBe('invalid_request');
  });

  it('returns 404 for unknown or malformed conversation ids', async () => {
    const { app } = buildApp();
    await request(app).get('/conversations/00000000-0000-4000-8000-000000000000/messages').expect(404);
    const res = await request(app).get('/conversations/not-a-uuid/messages').expect(404);
    expect(res.body.error).toEqual({ code: 'not_found', message: 'Conversa não encontrada.' });
  });

  it('returns 404 JSON for unknown routes', async () => {
    const { app } = buildApp();
    const res = await request(app).get('/nope').expect(404);
    expect(res.body.error.code).toBe('not_found');
  });
});

describe('POST /conversations/:id/messages', () => {
  it('streams meta, tokens and done as SSE, then the history has both messages', async () => {
    const { app } = buildApp();
    const { body: conversation } = await request(app).post('/conversations').send({});

    const res = await request(app)
      .post(`/conversations/${conversation.id}/messages`)
      .send({ content: 'Oi, AçaIA!' })
      .buffer(true)
      .parse(asText)
      .expect(200);

    expect(res.headers['content-type']).toMatch(/^text\/event-stream/);
    expect(res.headers['cache-control']).toContain('no-cache');
    const events = parseEvents(res.body);
    expect(events[0].event).toBe('meta');
    expect(events.filter((e) => e.event === 'token').map((e) => e.data.text).join('')).toBe('Oi! Tudo certo.');
    expect(events.at(-1)?.event).toBe('done');

    const history = await request(app).get(`/conversations/${conversation.id}/messages`).expect(200);
    expect(history.body.messages.map((m) => m.role)).toEqual(['user', 'assistant']);
  });

  it('validates the message body', async () => {
    const { app } = buildApp();
    const { body: conversation } = await request(app).post('/conversations').send({});
    const empty = await request(app).post(`/conversations/${conversation.id}/messages`).send({ content: '   ' }).expect(400);
    expect(empty.body.error.issues[0].message).toBe('A mensagem está vazia.');
    await request(app)
      .post(`/conversations/${conversation.id}/messages`)
      .set('Content-Type', 'application/json')
      .send('{bad json')
      .expect(400);
  });

  it('rejects bodies over the size limit with 413', async () => {
    const { app } = buildApp();
    const { body: conversation } = await request(app).post('/conversations').send({});
    const res = await request(app)
      .post(`/conversations/${conversation.id}/messages`)
      .send({ content: 'a'.repeat(20_000) })
      .expect(413);
    expect(res.body.error.code).toBe('payload_too_large');
  });

  it('cancels the model call when the client disconnects', async () => {
    let aborted = false;
    const proProvider = {
      name: 'pro',
      model: 'slow',
      async *stream({ signal }) {
        yield { type: 'token', text: 'começo ' };
        await new Promise((resolve) => signal.addEventListener('abort', resolve, { once: true }));
        aborted = true;
        throw Object.assign(new Error('aborted'), { code: 'aborted' });
      },
    };
    const { app } = buildApp({ proProvider });
    const server = app.listen(0, '127.0.0.1');
    await new Promise((resolve) => server.once('listening', resolve));
    const { port } = /** @type {import('node:net').AddressInfo} */ (server.address());
    try {
      const base = `http://127.0.0.1:${port}`;
      const conversation = await (await fetch(`${base}/conversations`, { method: 'POST' })).json();
      const controller = new AbortController();
      const response = await fetch(`${base}/conversations/${conversation.id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: 'Oi' }),
        signal: controller.signal,
      });
      const reader = /** @type {ReadableStream} */ (response.body).getReader();
      await reader.read(); // first bytes arrived: the model is "generating"
      controller.abort();
      await expect.poll(() => aborted).toBe(true);
    } finally {
      server.closeAllConnections();
      server.close();
    }
  });
});
