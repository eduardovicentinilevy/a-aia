import { afterEach, describe, expect, it, vi } from 'vitest';
import { API_BASE_URL, ApiError, createConversation, sendMessage } from '../src/lib/api.js';

/** A Response whose body arrives in separate chunks, like a real stream. */
function streamingResponse(chunks, init = { status: 200, headers: { 'Content-Type': 'text/event-stream' } }) {
  const encoder = new TextEncoder();
  const body = new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Response(body, init);
}

afterEach(() => vi.unstubAllGlobals());

describe('createConversation', () => {
  it('POSTs to /conversations and returns the conversation', async () => {
    const fetchMock = vi.fn(async () => Response.json({ id: 'c1', title: 'Nova conversa' }, { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(createConversation()).resolves.toEqual({ id: 'c1', title: 'Nova conversa' });
    expect(fetchMock).toHaveBeenCalledWith(`${API_BASE_URL}/conversations`, expect.objectContaining({ method: 'POST' }));
  });

  it('throws ApiError with the message sent by the API', async () => {
    vi.stubGlobal('fetch', async () => Response.json({ error: { code: 'internal', message: 'Erro interno.' } }, { status: 500 }));
    await expect(createConversation()).rejects.toMatchObject({ name: 'ApiError', status: 500, message: 'Erro interno.' });
  });
});

describe('sendMessage', () => {
  it('delivers each SSE event, in order, with parsed JSON', async () => {
    const fetchMock = vi.fn(async () =>
      streamingResponse([
        'event: meta\ndata: {"tier":"pro","model":"mock"}\n\n',
        'event: token\ndata: {"text":"Ol',
        'á"}\n\nevent: done\ndata: {"latencyMs":5}\n\n',
      ]),
    );
    vi.stubGlobal('fetch', fetchMock);
    const events = [];

    await sendMessage('c 1', 'Oi', { onEvent: (event, data) => events.push([event, data]) });

    expect(events).toEqual([
      ['meta', { tier: 'pro', model: 'mock' }],
      ['token', { text: 'Olá' }],
      ['done', { latencyMs: 5 }],
    ]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${API_BASE_URL}/conversations/c%201/messages`);
    expect(JSON.parse(init.body)).toEqual({ content: 'Oi' });
    expect(init.headers.Accept).toBe('text/event-stream');
  });

  it('throws ApiError for validation errors (before any streaming)', async () => {
    vi.stubGlobal('fetch', async () =>
      Response.json({ error: { code: 'invalid_request', message: 'Dados inválidos.' } }, { status: 400 }),
    );
    const error = await sendMessage('c1', '', { onEvent: () => {} }).catch((err) => err);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.message).toBe('Dados inválidos.');
  });

  it('uses a generic message when the error body is not JSON', async () => {
    vi.stubGlobal('fetch', async () => new Response('Bad Gateway', { status: 502 }));
    await expect(sendMessage('c1', 'Oi', { onEvent: () => {} })).rejects.toMatchObject({
      message: 'A API respondeu com erro 502.',
    });
  });
});
