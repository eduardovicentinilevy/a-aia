import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseSSE } from '../src/lib/sse-parser.js';

/**
 * Builds a ReadableStream that delivers the given pieces as separate chunks,
 * like a network connection would.
 * @param {(string|Uint8Array)[]} pieces
 */
function streamOf(pieces) {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const piece of pieces) controller.enqueue(typeof piece === 'string' ? encoder.encode(piece) : piece);
      controller.close();
    },
  });
}

/** @param {ReadableStream<Uint8Array>} stream */
async function collect(stream) {
  const events = [];
  for await (const event of parseSSE(stream)) events.push(event);
  return events;
}

describe('parseSSE', () => {
  it('parses named events and default "message" events', async () => {
    const events = await collect(streamOf(['event: meta\ndata: {"a":1}\n\ndata: hello\n\n']));
    expect(events).toEqual([
      { event: 'meta', data: '{"a":1}' },
      { event: 'message', data: 'hello' },
    ]);
  });

  it('reassembles events split across chunks, even mid-line', async () => {
    const events = await collect(streamOf(['ev', 'ent: tok', 'en\nda', 'ta: {"text":"Ol', 'á"}\n', '\n']));
    expect(events).toEqual([{ event: 'token', data: '{"text":"Olá"}' }]);
  });

  it('handles a multi-byte UTF-8 character split between chunks', async () => {
    const bytes = new TextEncoder().encode('data: açaí\n\n');
    const cut = bytes.indexOf(0xc3) + 1; // in the middle of "ç"
    const events = await collect(streamOf([bytes.slice(0, cut), bytes.slice(cut)]));
    expect(events).toEqual([{ event: 'message', data: 'açaí' }]);
  });

  it('accepts CRLF and CR line endings, including CRLF split across chunks', async () => {
    const events = await collect(streamOf(['data: a\r', '\n\r\n', 'data: b\r\rdata: c\r\n\r\n']));
    expect(events.map((e) => e.data)).toEqual(['a', 'b', 'c']);
  });

  it('ignores comments and joins multi-line data', async () => {
    const events = await collect(streamOf([': keep-alive\n\ndata: line 1\ndata: line 2\nid: 7\n\n']));
    expect(events).toEqual([{ event: 'message', data: 'line 1\nline 2', id: '7' }]);
  });

  it('emits a last event even without the final blank line', async () => {
    const events = await collect(streamOf(['data: [DONE]']));
    expect(events).toEqual([{ event: 'message', data: '[DONE]' }]);
  });

  it('is identical to the copy used by the web app', () => {
    const api = readFileSync(new URL('../src/lib/sse-parser.js', import.meta.url), 'utf8');
    const web = readFileSync(new URL('../../web/public/js/sse-parser.js', import.meta.url), 'utf8');
    expect(web).toBe(api);
  });
});
