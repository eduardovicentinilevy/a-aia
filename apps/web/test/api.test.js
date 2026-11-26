import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  API_BASE_URL,
  ApiError,
  configureApi,
  createConversation,
  deleteConversation,
  getMessages,
  listConversations,
  renameConversation,
  sendMessage,
} from '../src/lib/api.js';

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

afterEach(() => {
  vi.unstubAllGlobals();
  configureApi({ getToken: async () => null });
});

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

describe('authentication', () => {
  it('sends the Firebase ID token as a Bearer header when signed in', async () => {
    const fetchMock = vi.fn(async () => Response.json({ conversations: [] }));
    vi.stubGlobal('fetch', fetchMock);
    configureApi({ getToken: async () => 'id-token-123' });

    await listConversations();
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer id-token-123');
  });

  it('sends no Authorization header when login is disabled', async () => {
    const fetchMock = vi.fn(async () => Response.json({ conversations: [] }));
    vi.stubGlobal('fetch', fetchMock);
    await listConversations();
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBeUndefined();
  });

  it.each([401, 403])('reports HTTP %i to the auth error handler', async (status) => {
    const onAuthError = vi.fn();
    configureApi({ getToken: async () => 't', onAuthError });
    vi.stubGlobal('fetch', async () => Response.json({ error: { code: 'x', message: 'Sem acesso.' } }, { status }));

    await expect(listConversations()).rejects.toBeInstanceOf(ApiError);
    expect(onAuthError).toHaveBeenCalledWith(expect.objectContaining({ status, message: 'Sem acesso.' }));
  });

  it('does not call the auth handler for other errors', async () => {
    const onAuthError = vi.fn();
    configureApi({ getToken: async () => 't', onAuthError });
    vi.stubGlobal('fetch', async () => Response.json({ error: { code: 'daily_limit_reached', message: 'Limite.' } }, { status: 429 }));
    await expect(listConversations()).rejects.toMatchObject({ status: 429 });
    expect(onAuthError).not.toHaveBeenCalled();
  });
});

describe('conversation endpoints', () => {
  it('renames, deletes and reads history with the right method and URL', async () => {
    const fetchMock = vi.fn(async (_url, init) =>
      init?.method === 'DELETE' ? new Response(null, { status: 204 }) : Response.json({ id: 'c1', title: 'Novo', messages: [] }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await renameConversation('c1', 'Novo');
    await deleteConversation('c1');
    await getMessages('c1');

    expect(fetchMock.mock.calls.map(([url, init]) => [init.method ?? 'GET', url])).toEqual([
      ['PATCH', `${API_BASE_URL}/conversations/c1`],
      ['DELETE', `${API_BASE_URL}/conversations/c1`],
      ['GET', `${API_BASE_URL}/conversations/c1/messages`],
    ]);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ title: 'Novo' });
  });
});

